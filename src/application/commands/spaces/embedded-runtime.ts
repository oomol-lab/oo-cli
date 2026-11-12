import type { Writer } from "../../contracts/cli.ts";

import { spawn } from "node:child_process";
import { copyFile, link, mkdtemp, readdir, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import process from "node:process";
import { CliUserError } from "../../contracts/cli.ts";

// The runtime a project is installed, built and deployed with. The compiled
// CLI is itself a Bun: run with BUN_BE_BUN set, its executable behaves as
// `bun`, so the host needs neither node, npm nor bun. Package scripts,
// `#!/usr/bin/env node` executables and the processes the Convex CLI spawns
// reach the same runtime through a temporary directory, put first on PATH,
// that holds `bun` and `node` entries for the executable: symbolic links, or
// on Windows `bun.exe` and `node.exe` files.

export interface EmbeddedRuntime {
    execPath: string;
    /** Holds the `bun` and `node` entries; removed by `dispose`. */
    shimDir: string;
    dispose: () => Promise<void>;
}

const shimDirPrefix = "oo-spaces-runtime-";
const staleShimDirAgeMs = 24 * 60 * 60 * 1000;

export async function createEmbeddedRuntime(
    execPath: string,
    platform: NodeJS.Platform = process.platform,
): Promise<EmbeddedRuntime> {
    const root = tmpdir();

    await removeStaleShimDirs(root, Date.now() - staleShimDirAgeMs);

    const shimDir = await mkdtemp(join(root, shimDirPrefix));

    try {
        if (platform === "win32") {
            await createWindowsShims(execPath, shimDir);
        }
        else {
            await Promise.all([
                symlink(execPath, join(shimDir, "bun")),
                symlink(execPath, join(shimDir, "node")),
            ]);
        }
    }
    catch (error) {
        await removeShimDir(shimDir);

        throw error;
    }

    return {
        execPath,
        shimDir,
        dispose: async () => await removeShimDir(shimDir),
    };
}

// Windows offers no symbolic links without elevation, and resolves a command
// by its `.exe` name. The executable is copied rather than hard linked: a hard
// link only works on the volume of the installation, while the copy is an
// ordinary file that nothing holds open once the children have exited, so it
// can be removed again. The second name is a hard link to the copy, with a
// second copy as the fallback for file systems without hard links.
async function createWindowsShims(execPath: string, shimDir: string): Promise<void> {
    const bun = join(shimDir, "bun.exe");
    const node = join(shimDir, "node.exe");

    await copyFile(execPath, bun);

    try {
        await link(bun, node);
    }
    catch {
        await copyFile(bun, node);
    }
}

// A deploy that is killed never reaches `dispose`, which on Windows leaves a
// copy of the executable behind. Directories far older than any deploy can run
// are removed before a new one is created; a failure here is not the deploy's.
async function removeStaleShimDirs(root: string, olderThanMs: number): Promise<void> {
    try {
        const names = (await readdir(root)).filter(name => name.startsWith(shimDirPrefix));

        await Promise.all(names.map(async (name) => {
            try {
                const path = join(root, name);

                if ((await stat(path)).mtimeMs < olderThanMs) {
                    await rm(path, { force: true, recursive: true });
                }
            }
            catch {}
        }));
    }
    catch {}
}

const shimDirRemovalAttempts = 5;
const shimDirRemovalDelayMs = 200;

// Best effort: a virus scanner or a process the build left behind can keep the
// copied executable open for a moment on Windows, and a deploy that already
// finished must not fail over a temporary directory.
async function removeShimDir(shimDir: string): Promise<void> {
    for (let attempt = 1; attempt <= shimDirRemovalAttempts; attempt += 1) {
        try {
            await rm(shimDir, { force: true, recursive: true });

            return;
        }
        catch {
            if (attempt < shimDirRemovalAttempts) {
                await Bun.sleep(shimDirRemovalDelayMs);
            }
        }
    }
}

// The environment of every child process: the CLI's own credentials (`OO_*`)
// stay out of project scripts, and CONVEX_DEPLOYMENT is dropped because a dev
// deployment left in the caller's environment must not redirect the deploy,
// which is selected by CONVEX_DEPLOY_KEY alone. Windows variable names are
// case-insensitive (the search path is usually spelled `Path`), so they are
// compared in upper case there and the search path is written back as `PATH`.
export function createRuntimeEnv(input: {
    base: Record<string, string | undefined>;
    platform?: NodeJS.Platform;
    projectRoot: string;
    shimDir: string;
}): Record<string, string> {
    const isWindows = (input.platform ?? process.platform) === "win32";
    const env: Record<string, string> = {};
    let inheritedPath: string | undefined;

    for (const [key, value] of Object.entries(input.base)) {
        const name = isWindows ? key.toUpperCase() : key;

        if (value === undefined || name.startsWith("OO_") || name === "CONVEX_DEPLOYMENT") {
            continue;
        }

        if (name === "PATH") {
            inheritedPath = value;
            continue;
        }

        env[key] = value;
    }

    const path = [input.shimDir, join(input.projectRoot, "node_modules", ".bin")];

    if (inheritedPath !== undefined && inheritedPath !== "") {
        path.push(inheritedPath);
    }

    env.PATH = path.join((isWindows ? win32 : posix).delimiter);
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
