import type { Writer } from "../../contracts/cli.ts";

import { spawn } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";

// The runtime a project is installed, built and deployed with. The compiled
// CLI is itself a Bun: run with BUN_BE_BUN set, its executable behaves as
// `bun`, so the host needs neither node, npm nor bun. Package scripts,
// `#!/usr/bin/env node` executables and the processes the Convex CLI spawns
// reach the same runtime through a temporary directory, put first on PATH,
// that holds `bun` and `node` links to the executable.

export interface EmbeddedRuntime {
    execPath: string;
    /** Holds the `bun` and `node` links; removed by `dispose`. */
    shimDir: string;
    dispose: () => Promise<void>;
}

export async function createEmbeddedRuntime(execPath: string): Promise<EmbeddedRuntime> {
    const shimDir = await mkdtemp(join(tmpdir(), "oo-spaces-runtime-"));

    await Promise.all([
        symlink(execPath, join(shimDir, "bun")),
        symlink(execPath, join(shimDir, "node")),
    ]);

    return {
        execPath,
        shimDir,
        dispose: async () => await rm(shimDir, { force: true, recursive: true }),
    };
}

// The environment of every child process: the CLI's own credentials (`OO_*`)
// stay out of project scripts, and CONVEX_DEPLOYMENT is dropped because a dev
// deployment left in the caller's environment must not redirect the deploy,
// which is selected by CONVEX_DEPLOY_KEY alone.
export function createRuntimeEnv(input: {
    base: Record<string, string | undefined>;
    projectRoot: string;
    shimDir: string;
}): Record<string, string> {
    const env: Record<string, string> = {};
    let inheritedPath: string | undefined;

    for (const [key, value] of Object.entries(input.base)) {
        if (value === undefined || key.startsWith("OO_") || key === "CONVEX_DEPLOYMENT") {
            continue;
        }

        if (key === "PATH") {
            inheritedPath = value;
            continue;
        }

        env[key] = value;
    }

    const path = [input.shimDir, join(input.projectRoot, "node_modules", ".bin")];

    if (inheritedPath !== undefined && inheritedPath !== "") {
        path.push(inheritedPath);
    }

    env.PATH = path.join(delimiter);
    env.BUN_BE_BUN = "1";

    return env;
}

interface RunOptions {
    cwd: string;
    env: Record<string, string>;
    /** Receives the child's stdout and stderr, so stdout stays free for the command's own result. */
    output: Writer;
    /** Runs `command` as a shell command line instead of an executable. */
    shell?: boolean;
}

export interface RunResult {
    exitCode: number;
    signal: NodeJS.Signals | null;
}

// Runs a child process to completion. It only forwards the output and reports
// how the process ended; the caller decides what a non-zero exit means.
export async function runProcess(command: string, args: readonly string[], options: RunOptions): Promise<RunResult> {
    return await new Promise<RunResult>((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env,
            shell: options.shell === true,
            stdio: ["ignore", "pipe", "pipe"],
        });

        child.stdout.on("data", chunk => options.output.write(String(chunk)));
        child.stderr.on("data", chunk => options.output.write(String(chunk)));
        child.on("error", error => reject(new CliUserError("errors.spaces.spawnFailed", 1, {
            command,
            message: error.message,
        })));
        child.on("close", (code, signal) => resolve({ exitCode: code ?? 1, signal }));
    });
}

export function describeExit(result: RunResult): string {
    return result.signal === null ? `exit code ${result.exitCode}` : `killed by ${result.signal}`;
}
