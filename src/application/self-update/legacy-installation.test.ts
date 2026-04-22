import type { SelfUpdateCommandRunOptions } from "../contracts/self-update.ts";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import {
    createLogCapture,
    createTemporaryDirectory,
    joinPathEntries,
    useTemporaryDirectoryCleanup,
} from "../../../__tests__/helpers.ts";
import { attemptLegacyPackageManagerUninstall } from "./legacy-installation.ts";
import { resolveSelfUpdatePaths } from "./paths.ts";

const { track: trackDirectory } = useTemporaryDirectoryCleanup();

describe("attemptLegacyPackageManagerUninstall", () => {
    test("runs the matching package manager uninstall command", async () => {
        const logCapture = createLogCapture();
        const commands: Array<{
            commandArguments: readonly string[];
            commandPath: string;
            timeoutMs: number;
        }> = [];

        try {
            await attemptLegacyPackageManagerUninstall({
                env: {},
                execPath: "/Users/demo/Library/pnpm/global/5/node_modules/@oomol-lab/oo-cli/bin/oo",
                logger: logCapture.logger,
                platform: "linux",
                resolveCommandPath: commandName => `/mock/bin/${commandName}`,
                runCommand: async (options) => {
                    commands.push({
                        commandArguments: options.commandArguments,
                        commandPath: options.commandPath,
                        timeoutMs: options.timeoutMs,
                    });

                    return {
                        exitCode: 0,
                        signalCode: null,
                        stderr: "",
                        stdout: "",
                    };
                },
            });

            expect(commands).toEqual([
                {
                    commandArguments: ["remove", "-g", "@oomol-lab/oo-cli"],
                    commandPath: "/mock/bin/pnpm",
                    timeoutMs: 10_000,
                },
            ]);
            expect(logCapture.read()).toContain("Legacy package-manager oo-cli uninstall completed.");
        }
        finally {
            logCapture.close();
        }
    });

    test("swallows uninstall failures and logs a warning", async () => {
        const logCapture = createLogCapture();

        try {
            await expect(attemptLegacyPackageManagerUninstall({
                env: {},
                execPath: "/usr/local/lib/node_modules/@oomol-lab/oo-cli/bin/oo",
                logger: logCapture.logger,
                platform: "linux",
                resolveCommandPath: commandName => `/mock/bin/${commandName}`,
                runCommand: async () => ({
                    exitCode: 1,
                    signalCode: null,
                    stderr: "permission denied",
                    stdout: "",
                }),
            })).resolves.toBeUndefined();

            expect(logCapture.read()).toContain("Legacy package-manager oo-cli uninstall failed.");
            expect(logCapture.read()).toContain("permission denied");
        }
        finally {
            logCapture.close();
        }
    });

    test("uninstalls package managers found anywhere on PATH", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-path");
        const env = createLegacyCleanupEnv(rootDirectory);
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });
        const bunDirectory = join(rootDirectory, ".bun", "bin");
        const pnpmDirectory = join(rootDirectory, "Library", "pnpm", "bin");
        const commands = createRecordedCommands();
        const logCapture = createLogCapture();

        trackDirectory(rootDirectory);
        env.PATH = joinPathEntries(
            [bunDirectory, paths.executableDirectory, pnpmDirectory],
            process.platform,
        );
        await Promise.all([
            writeExecutable(join(bunDirectory, basename(paths.executablePath))),
            writeExecutable(paths.executablePath),
            writeExecutable(join(pnpmDirectory, basename(paths.executablePath))),
        ]);

        try {
            await attemptLegacyPackageManagerUninstall({
                env,
                execPath: join(rootDirectory, "downloads", basename(paths.executablePath)),
                logger: logCapture.logger,
                platform: process.platform,
                resolveCommandPath: commandName => `/mock/bin/${commandName}`,
                runCommand: commands.runCommand,
            });

            expect(commands.read()).toEqual([
                {
                    commandArguments: ["remove", "-g", "@oomol-lab/oo-cli"],
                    commandPath: "/mock/bin/bun",
                    timeoutMs: 10_000,
                },
                {
                    commandArguments: ["remove", "-g", "@oomol-lab/oo-cli"],
                    commandPath: "/mock/bin/pnpm",
                    timeoutMs: 10_000,
                },
            ]);
        }
        finally {
            logCapture.close();
        }
    });

    test("does not fall back to execPath when PATH is blocked by an unknown oo executable", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-blocked");
        const env = createLegacyCleanupEnv(rootDirectory);
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });
        const customDirectory = join(rootDirectory, "custom", "bin");
        const commands = createRecordedCommands();
        const logCapture = createLogCapture();

        trackDirectory(rootDirectory);
        env.PATH = joinPathEntries(
            [customDirectory, paths.executableDirectory],
            process.platform,
        );
        await Promise.all([
            writeExecutable(join(customDirectory, basename(paths.executablePath))),
            writeExecutable(paths.executablePath),
        ]);

        try {
            await attemptLegacyPackageManagerUninstall({
                env,
                execPath: join(
                    rootDirectory,
                    ".bun",
                    "install",
                    "global",
                    "node_modules",
                    "@oomol-lab",
                    "oo-cli",
                    "bin",
                    basename(paths.executablePath),
                ),
                logger: logCapture.logger,
                platform: process.platform,
                resolveCommandPath: commandName => `/mock/bin/${commandName}`,
                runCommand: commands.runCommand,
            });

            expect(commands.read()).toEqual([]);
        }
        finally {
            logCapture.close();
        }
    });

    test("falls back to execPath when PATH has no oo candidates", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-fallback");
        const env = createLegacyCleanupEnv(rootDirectory);
        const commands = createRecordedCommands();
        const logCapture = createLogCapture();

        trackDirectory(rootDirectory);
        env.PATH = joinPathEntries([join(rootDirectory, "empty", "bin")], process.platform);

        try {
            await attemptLegacyPackageManagerUninstall({
                env,
                execPath: join(
                    rootDirectory,
                    ".bun",
                    "install",
                    "global",
                    "node_modules",
                    "@oomol-lab",
                    "oo-cli",
                    "bin",
                    readExecutableName(process.platform),
                ),
                logger: logCapture.logger,
                platform: process.platform,
                resolveCommandPath: commandName => `/mock/bin/${commandName}`,
                runCommand: commands.runCommand,
            });

            expect(commands.read()).toEqual([
                {
                    commandArguments: ["remove", "-g", "@oomol-lab/oo-cli"],
                    commandPath: "/mock/bin/bun",
                    timeoutMs: 10_000,
                },
            ]);
        }
        finally {
            logCapture.close();
        }
    });

    test("ignores oo.cmd PATH candidates on Windows and falls back to execPath", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-win32");
        const env = createLegacyCleanupEnv(rootDirectory);
        const commands = createRecordedCommands();
        const logCapture = createLogCapture();
        const probedPaths: string[] = [];

        trackDirectory(rootDirectory);
        env.PATH = "legacy-bin;managed-bin";

        try {
            await attemptLegacyPackageManagerUninstall({
                env,
                execPath: "C:\\Users\\demo\\.bun\\install\\global\\node_modules\\@oomol-lab\\oo-cli\\bin\\oo.exe",
                logger: logCapture.logger,
                pathExists: async (path) => {
                    probedPaths.push(path);
                    return path === "legacy-bin\\oo.cmd";
                },
                platform: "win32",
                resolveCommandPath: commandName => `/mock/bin/${commandName}`,
                runCommand: commands.runCommand,
            });

            expect(probedPaths).toEqual([
                "legacy-bin\\oo.exe",
                "managed-bin\\oo.exe",
            ]);
            expect(commands.read()).toEqual([
                {
                    commandArguments: ["remove", "-g", "@oomol-lab/oo-cli"],
                    commandPath: "/mock/bin/bun",
                    timeoutMs: 10_000,
                },
            ]);
        }
        finally {
            logCapture.close();
        }
    });
});

function createLegacyCleanupEnv(rootDirectory: string): Record<string, string | undefined> {
    return {
        APPDATA: join(rootDirectory, "appdata"),
        HOME: rootDirectory,
        PATH: undefined,
        TEMP: join(rootDirectory, "temp"),
        TMP: join(rootDirectory, "temp"),
        TMPDIR: join(rootDirectory, "tmpdir"),
        USERPROFILE: rootDirectory,
        XDG_CACHE_HOME: join(rootDirectory, "cache"),
        XDG_DATA_HOME: join(rootDirectory, "data"),
        XDG_RUNTIME_DIR: join(rootDirectory, "runtime"),
    };
}

function readExecutableName(
    platform: NodeJS.Platform,
): string {
    return platform === "win32"
        ? "oo.exe"
        : "oo";
}

async function writeExecutable(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "binary");

    if (process.platform !== "win32") {
        await chmod(path, 0o755);
    }
}

function createRecordedCommands(): {
    read: () => Array<{
        commandArguments: readonly string[];
        commandPath: string;
        timeoutMs: number;
    }>;
    runCommand: (options: SelfUpdateCommandRunOptions) => Promise<{
        exitCode: number;
        signalCode: null;
        stderr: string;
        stdout: string;
    }>;
} {
    const commands: Array<{
        commandArguments: readonly string[];
        commandPath: string;
        timeoutMs: number;
    }> = [];

    return {
        read() {
            return [...commands];
        },
        runCommand: async (options) => {
            commands.push({
                commandArguments: options.commandArguments,
                commandPath: options.commandPath,
                timeoutMs: options.timeoutMs,
            });

            return {
                exitCode: 0,
                signalCode: null,
                stderr: "",
                stdout: "",
            };
        },
    };
}
