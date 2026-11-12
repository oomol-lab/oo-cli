import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { Space, SpacesClient } from "./api.ts";

import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { CliUserError } from "../../contracts/cli.ts";
import { isPathMissingError } from "../../shared/fs-errors.ts";
import { issueDeployCredentials } from "./api.ts";
import { createEmbeddedRuntime, createRuntimeEnv, describeExit, runProcess } from "./embedded-runtime.ts";

// A deployable project: a package.json project whose build writes a static
// site, optionally with a Convex backend in `convex/`.

const defaultDistDir = "dist";
const defaultBuildCommand = "bun run build";
const convexDeployArgs = ["deploy", "--yes"] as const;
// The names common frameworks read the deployment URL from during a build.
const convexUrlEnvNames = ["VITE_CONVEX_URL", "CONVEX_URL", "NEXT_PUBLIC_CONVEX_URL", "PUBLIC_CONVEX_URL"] as const;

export interface ProjectInfo {
    /** `null` skips the build; the site must then already be in `distDir`. */
    buildCommand: string | null;
    distDir: string;
    /** The project has a `convex/` directory, which is deployed before the build. */
    hasBackend: boolean;
    root: string;
}

async function pathIs(path: string, kind: "directory" | "file"): Promise<boolean> {
    const info = await stat(path).catch((error: unknown) => {
        if (isPathMissingError(error)) {
            return undefined;
        }

        throw error;
    });

    return info !== undefined && (kind === "directory" ? info.isDirectory() : info.isFile());
}

async function readBuildScript(root: string): Promise<string | undefined> {
    const path = join(root, "package.json");
    const text = await readFile(path, "utf8").catch((error: unknown) => {
        if (isPathMissingError(error)) {
            throw new CliUserError("errors.spaces.packageJsonMissing", 2, { path: root });
        }

        throw error;
    });
    let parsed: unknown;

    try {
        parsed = JSON.parse(text);
    }
    catch (error) {
        throw new CliUserError("errors.spaces.packageJsonInvalid", 2, {
            message: error instanceof Error ? error.message : String(error),
            path,
        });
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new CliUserError("errors.spaces.packageJsonInvalid", 2, { message: "not an object", path });
    }

    const scripts: unknown = (parsed as { scripts?: unknown }).scripts;
    const build: unknown = scripts !== null && typeof scripts === "object"
        ? (scripts as { build?: unknown }).build
        : undefined;

    return typeof build === "string" ? build : undefined;
}

// Reads the project layout without running anything. `--build ""` (or blank)
// skips the build explicitly.
export async function inspectProject(
    root: string,
    options: { buildCommand?: string; distDir?: string },
): Promise<ProjectInfo> {
    if (!(await pathIs(root, "directory"))) {
        throw new CliUserError("errors.spaces.projectNotFound", 2, { path: root });
    }

    const buildScript = await readBuildScript(root);
    const explicitBuild = options.buildCommand?.trim();
    const buildCommand = explicitBuild === undefined
        ? (buildScript === undefined ? null : defaultBuildCommand)
        : (explicitBuild === "" ? null : explicitBuild);
    const distDir = resolve(root, options.distDir ?? defaultDistDir);

    if (buildCommand === null && !(await pathIs(join(distDir, "index.html"), "file"))) {
        throw new CliUserError("errors.spaces.buildRequired", 2, { path: distDir });
    }

    return {
        buildCommand,
        distDir,
        hasBackend: await pathIs(join(root, "convex"), "directory"),
        root,
    };
}

export function convexUrlEnv(url: string, extraName: string | undefined): Record<string, string> {
    const names = extraName === undefined ? convexUrlEnvNames : [...convexUrlEnvNames, extraName];

    return Object.fromEntries(names.map(name => [name, url]));
}

type ProjectDeployContext = Pick<CliExecutionContext, "env" | "execPath" | "stderr" | "translator">;

// The local half of a project deploy: install dependencies, push the Convex
// backend with the project's own `convex` package, then build the front end
// with the deployment URL in the environment. The backend goes first because a
// first deploy generates `convex/_generated`, which the front end build
// imports; a failed build therefore leaves the new backend live, and deploying
// again after the fix completes it. The deploy key reaches the child through
// its environment only: it is never written to a file or printed.
export async function deployProjectLocally(
    options: {
        client: SpacesClient;
        install: boolean;
        /** Receives one line of progress per step. */
        note: (message: string) => void;
        project: ProjectInfo;
        space: Space;
        urlEnv: string | undefined;
    },
    context: ProjectDeployContext,
): Promise<void> {
    const { client, note, project, space } = options;
    const t = context.translator.t.bind(context.translator);
    const deploymentUrl = space.convexDeploymentUrl;

    if (deploymentUrl === null) {
        throw new CliUserError("errors.spaces.notReady", 1, { slug: space.slug, status: space.status });
    }

    // The `bun` and `node` links the runtime relies on need symbolic links to
    // an executable, which Windows does not offer without elevation.
    if (process.platform === "win32") {
        throw new CliUserError("errors.spaces.projectDeployUnsupportedPlatform", 1);
    }

    const runtime = await createEmbeddedRuntime(context.execPath);

    try {
        const run = { cwd: project.root, output: context.stderr };
        const env = createRuntimeEnv({ base: context.env, projectRoot: project.root, shimDir: runtime.shimDir });

        if (options.install) {
            note(t("spaces.deploy.installing", { path: project.root }));

            const installed = await runProcess(runtime.execPath, ["install"], { ...run, env });

            if (installed.exitCode !== 0) {
                throw new CliUserError("errors.spaces.installFailed", 1, { exit: describeExit(installed) });
            }
        }

        if (project.hasBackend) {
            const entry = join(project.root, "node_modules", "convex", "bin", "main.js");

            if (!(await pathIs(entry, "file"))) {
                throw new CliUserError("errors.spaces.convexNotInstalled", 1, { path: project.root });
            }

            const credentials = await issueDeployCredentials(client, space.id);

            note(t("spaces.deploy.pushingBackend", { deployment: credentials.deploymentName }));

            const deployed = await runProcess(runtime.execPath, [entry, ...convexDeployArgs], {
                ...run,
                env: { ...env, CONVEX_DEPLOY_KEY: credentials.deployKey },
            });

            if (deployed.exitCode !== 0) {
                throw new CliUserError("errors.spaces.backendDeployFailed", 1, { exit: describeExit(deployed) });
            }
        }
        else {
            note(t("spaces.deploy.noBackend"));
        }

        if (project.buildCommand !== null) {
            note(t("spaces.deploy.building", { command: project.buildCommand }));

            const built = await runProcess(project.buildCommand, [], {
                ...run,
                env: { ...env, ...convexUrlEnv(deploymentUrl, options.urlEnv) },
                shell: true,
            });

            if (built.exitCode !== 0) {
                throw new CliUserError("errors.spaces.buildFailed", 1, { exit: describeExit(built) });
            }
        }
    }
    finally {
        await runtime.dispose();
    }
}
