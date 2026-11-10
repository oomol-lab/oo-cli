import type { CliExecutionContext } from "../../contracts/cli.ts";

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import process from "node:process";
import { z } from "zod";

// What `deploy` publishes: static assets stay on disk and go straight to
// Cloudflare, while the Worker modules travel inline in the publish request.
export interface WebsiteBuild {
    assetsDir: string;
    worker: WorkerBundle;
}

export interface WorkerBundle {
    assets_binding: string;
    assets_config: z.infer<typeof assetsConfigSchema>;
    compatibility_date: string;
    compatibility_flags: string[];
    main_module: string;
    modules: { content_base64: string; name: string }[];
}

const defaultCompatibilityDate = "2026-07-15";
const workerModuleExtensions = new Set([".js", ".mjs", ".wasm"]);

const assetsConfigSchema = z.object({
    html_handling: z.enum(["auto-trailing-slash", "force-trailing-slash", "drop-trailing-slash", "none"]).optional(),
    not_found_handling: z.enum(["single-page-application", "404-page", "none"]).optional(),
    run_worker_first: z.union([z.boolean(), z.array(z.string())]).optional(),
});

// The Wrangler config the Astro Cloudflare adapter writes next to its server
// output (dist/server/wrangler.json); paths in it are relative to that file.
const generatedConfigSchema = z.object({
    main: z.string().min(1),
    compatibility_date: z.string().optional(),
    compatibility_flags: z.array(z.string()).optional(),
    assets: assetsConfigSchema.extend({
        binding: z.string().optional(),
        directory: z.string().min(1),
    }),
});

function inside(root: string, path: string): string {
    const result = resolve(root, path);
    const rel = relative(root, result);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error("Build paths must stay inside the project's dist directory.");
    }
    return result;
}

interface PackageManager {
    command: string;
    env: Record<string, string>;
    installArgs: string[];
}

// npm when the host has it. Otherwise the Bun runtime this CLI is built on:
// with BUN_BE_BUN set, the CLI executable runs as Bun itself, so a host that
// ships `node` without npm (an agent image, for example) can still build.
export function resolvePackageManager(env: Record<string, string | undefined>, execPath = process.execPath): PackageManager {
    if (Bun.which("npm", { PATH: env.PATH ?? "" }) !== null) {
        return {
            command: process.platform === "win32" ? "npm.cmd" : "npm",
            env: {},
            installArgs: ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
        };
    }
    return { command: execPath, env: { BUN_BE_BUN: "1" }, installArgs: ["install", "--ignore-scripts"] };
}

async function run(command: string, args: string[], cwd: string, context: CliExecutionContext, env: Record<string, string> = {}) {
    const childEnv = { ...context.env };
    for (const key of Object.keys(childEnv)) {
        if (key.startsWith("OO_") || key.startsWith("CLOUDFLARE_") || key.startsWith("CF_"))
            delete childEnv[key];
    }
    Object.assign(childEnv, env);
    await new Promise<void>((resolvePromise, reject) => {
        const child = spawn(command, args, { cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error("Website build timed out."));
        }, 300_000);
        child.stdout?.on("data", chunk => context.stderr.write(String(chunk)));
        child.stderr?.on("data", chunk => context.stderr.write(String(chunk)));
        child.on("error", (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.on("exit", (code) => {
            clearTimeout(timeout);
            if (code === 0)
                resolvePromise();
            else reject(new Error(`Website build exited with code ${code}.`));
        });
    });
}

// Wrangler's dry run writes the bundled entry plus a README and source maps;
// only executable modules are uploaded.
async function readWorkerModules(root: string): Promise<WorkerBundle["modules"]> {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    const files = entries
        .filter(entry => entry.isFile() && workerModuleExtensions.has(extname(entry.name)))
        .map(entry => join(entry.parentPath, entry.name));
    const modules = await Promise.all(files.map(async file => ({
        name: relative(root, file).split(sep).join("/"),
        content_base64: (await readFile(file)).toString("base64"),
    })));
    return modules.sort((a, b) => a.name.localeCompare(b.name));
}

export async function buildWebsite(project: string, context: CliExecutionContext): Promise<WebsiteBuild> {
    const packages = resolvePackageManager(context.env);
    await run(packages.command, packages.installArgs, project, context, packages.env);
    await run(packages.command, ["run", "build"], project, context, packages.env);
    const dist = join(project, "dist");
    const generatedFile = join(dist, "server", "wrangler.json");
    const parsed = generatedConfigSchema.safeParse(JSON.parse(await readFile(generatedFile, "utf8")));
    if (!parsed.success)
        throw new Error("Expected an Astro Cloudflare SSR build.");
    const config = parsed.data;
    const main = inside(dist, relative(dist, resolve(dirname(generatedFile), config.main)));
    const assetsDir = inside(dist, relative(dist, resolve(dirname(generatedFile), config.assets.directory)));
    const compatibilityDate = config.compatibility_date ?? defaultCompatibilityDate;
    const compatibilityFlags = config.compatibility_flags ?? ["nodejs_compat"];
    const output = await mkdtemp(join(tmpdir(), "leina-website-bundle-"));
    try {
        // Bundle the adapter's server output into one module so large sites
        // stay within the platform's module count limit.
        const buildConfig = join(output, "wrangler.json");
        await writeFile(buildConfig, JSON.stringify({
            name: "website-build",
            main,
            compatibility_date: compatibilityDate,
            compatibility_flags: compatibilityFlags,
        }));
        const wrangler = join(project, "node_modules", "wrangler", "bin", "wrangler.js");
        const modulesDir = join(output, "modules");
        await run("node", [wrangler, "deploy", "--dry-run", "--config", buildConfig, "--outdir", modulesDir], project, context);
        const modules = await readWorkerModules(modulesDir);
        const mainModule = `${parse(main).name}.js`;
        if (!modules.some(module => module.name === mainModule))
            throw new Error("Worker bundle has no entry module.");
        return {
            assetsDir,
            worker: {
                assets_binding: config.assets.binding ?? "ASSETS",
                // Drops the binding and directory, which are not asset options.
                assets_config: assetsConfigSchema.parse(config.assets),
                compatibility_date: compatibilityDate,
                compatibility_flags: compatibilityFlags,
                main_module: mainModule,
                modules,
            },
        };
    }
    finally {
        await rm(output, { recursive: true, force: true });
    }
}
