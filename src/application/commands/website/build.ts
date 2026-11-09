import type { CliExecutionContext } from "../../contracts/cli.ts";

import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import process from "node:process";

interface FilePart { name: string; content: string }

function inside(root: string, path: string): string {
    const result = resolve(root, path);
    const rel = relative(root, result);
    if (rel.startsWith("..") || isAbsolute(rel)) {
        throw new Error("Build paths must stay inside the project's dist directory.");
    }
    return result;
}

async function run(command: string, args: string[], cwd: string, context: CliExecutionContext) {
    const childEnv = { ...context.env };
    for (const key of Object.keys(childEnv)) {
        if (key.startsWith("OO_") || key.startsWith("CLOUDFLARE_") || key.startsWith("CF_"))
            delete childEnv[key];
    }
    const executable = process.platform === "win32" && command === "npm" ? "npm.cmd" : command;
    await new Promise<void>((resolvePromise, reject) => {
        const child = spawn(executable, args, { cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
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

async function files(root: string): Promise<FilePart[]> {
    const result: FilePart[] = [];
    let bytes = 0;
    async function visit(dir: string) {
        for (const entry of await readdir(dir, { withFileTypes: true })) {
            if (entry.name.startsWith("."))
                continue;
            const path = join(dir, entry.name);
            if (entry.isSymbolicLink())
                throw new Error("Symbolic links are not supported in website bundles.");
            if (entry.isDirectory()) {
                await visit(path);
            }
            else if (entry.isFile()) {
                const content = await readFile(path);
                bytes += content.byteLength;
                if (bytes > 12 * 1024 * 1024 || result.length >= 1000)
                    throw new Error("Website bundle exceeds the first-version limit.");
                result.push({ name: relative(root, path).split(process.platform === "win32" ? "\\" : "/").join("/"), content: content.toString("base64") });
            }
        }
    }
    await visit(root);
    return result.sort((a, b) => a.name.localeCompare(b.name));
}

export async function buildWebsite(project: string, context: CliExecutionContext) {
    await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], project, context);
    await run("npm", ["run", "build"], project, context);
    const dist = join(project, "dist");
    const generatedFile = join(dist, "server", "wrangler.json");
    const config = JSON.parse(await readFile(generatedFile, "utf8")) as {
        main: string;
        compatibility_date?: string;
        assets?: { directory?: string };
    };
    if (!config.main || !config.assets?.directory)
        throw new Error("Expected an Astro Cloudflare SSR build.");
    const main = inside(dist, relative(dist, resolve(dirname(generatedFile), config.main)));
    const assetDir = inside(dist, relative(dist, resolve(dirname(generatedFile), config.assets.directory)));
    const output = await mkdtemp(join(tmpdir(), "leina-website-bundle-"));
    try {
        const buildConfig = join(output, "wrangler.json");
        await writeFile(buildConfig, JSON.stringify({
            name: "website-build",
            main,
            compatibility_date: config.compatibility_date ?? "2026-07-15",
            compatibility_flags: ["nodejs_compat"],
        }));
        const wrangler = join(project, "node_modules", "wrangler", "bin", "wrangler.js");
        await run("node", [wrangler, "deploy", "--dry-run", "--config", buildConfig, "--outdir", join(output, "modules")], project, context);
        const modules = (await files(join(output, "modules"))).filter(file => file.name.endsWith(".js") || file.name.endsWith(".mjs") || file.name.endsWith(".wasm"));
        const entry = modules.find(file => !file.name.includes("/") && (file.name.endsWith(".js") || file.name.endsWith(".mjs")));
        if (!entry)
            throw new Error("Worker bundle has no entry module.");
        const bundle = {
            main: entry.name,
            compatibilityDate: config.compatibility_date ?? "2026-07-15",
            modules,
            assets: await files(assetDir),
        };
        const body = JSON.stringify(bundle);
        if (Buffer.byteLength(body) > 20 * 1024 * 1024)
            throw new Error("Website upload exceeds 20 MiB.");
        return { bundle, hash: createHash("sha256").update(body).digest("hex") };
    }
    finally {
        await rm(output, { recursive: true, force: true });
    }
}
