import type { CliExecutionContext } from "../contracts/cli.ts";

import { chmod, lstat, mkdtemp, readlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import pino from "pino";
import {
    createNoopFileDownloadSessionStore,
    createNoopFileUploadStore,
    createTextBuffer,
} from "../../../__tests__/helpers.ts";
import { createTranslator } from "../../i18n/translator.ts";
import { CliUserError } from "../contracts/cli.ts";
import {
    checkPathSetup,
    installBinary,
    resolveInstallSource,
    resolveInstallTarget,
    runSelfInstall,
    verifyInstall,
} from "./self-install.ts";

describe("self install helpers", () => {
    test("resolves install targets for unix and windows platforms", () => {
        expect(resolveInstallTarget({
            env: {
                HOME: "/Users/alice",
                USERPROFILE: "C:\\Users\\Alice",
            },
            platform: "darwin",
        })).toEqual({
            binDir: posix.join("/Users/alice", ".local", "bin"),
            binaryPath: posix.join("/Users/alice", ".local", "bin", "oo"),
            displayBinDir: "~/.local/bin",
            displayBinaryPath: "~/.local/bin/oo",
            isWindows: false,
            platform: "darwin",
        });

        expect(resolveInstallTarget({
            env: {
                HOME: "C:\\home-fallback",
                USERPROFILE: "C:\\Users\\Alice",
            },
            platform: "win32",
        })).toEqual({
            binDir: win32.join("C:\\Users\\Alice", ".local", "bin"),
            binaryPath: win32.join("C:\\Users\\Alice", ".local", "bin", "oo.exe"),
            displayBinDir: win32.join("C:\\Users\\Alice", ".local", "bin"),
            displayBinaryPath: win32.join(
                "C:\\Users\\Alice",
                ".local",
                "bin",
                "oo.exe",
            ),
            isWindows: true,
            platform: "win32",
        });
    });

    test("accepts PATH entries with duplicates and case differences", () => {
        const translator = createTranslator("en");
        const unixTarget = resolveInstallTarget({
            env: {
                HOME: "/Users/alice",
            },
            platform: "darwin",
        });
        const windowsTarget = resolveInstallTarget({
            env: {
                USERPROFILE: "C:\\Users\\Alice",
            },
            platform: "win32",
        });

        expect(checkPathSetup(unixTarget, {
            cwd: "/repo",
            env: {
                PATH: [
                    "",
                    "/usr/bin",
                    "/Users/alice/.local/bin",
                    "/Users/alice/.local/bin",
                ].join(":"),
                SHELL: "/bin/zsh",
            },
            platform: "darwin",
            translator,
        })).toEqual([]);

        expect(checkPathSetup(windowsTarget, {
            cwd: "C:\\repo",
            env: {
                PATH: [
                    "C:\\Windows\\System32",
                    "c:\\users\\ALICE\\.local\\bin",
                ].join(";"),
            },
            platform: "win32",
            translator,
        })).toEqual([]);
    });

    test("renders shell-specific PATH setup notes", () => {
        const translator = createTranslator("en");
        const target = resolveInstallTarget({
            env: {
                HOME: "/Users/alice",
            },
            platform: "darwin",
        });

        expect(checkPathSetup(target, {
            cwd: "/repo",
            env: {
                PATH: "/usr/bin",
                SHELL: "/bin/zsh",
            },
            platform: "darwin",
            translator,
        })[0]?.message).toContain("~/.zshrc");
        expect(checkPathSetup(target, {
            cwd: "/repo",
            env: {
                PATH: "/usr/bin",
                SHELL: "/bin/bash",
            },
            platform: "darwin",
            translator,
        })[0]?.message).toContain("~/.bashrc");
        expect(checkPathSetup(target, {
            cwd: "/repo",
            env: {
                PATH: "/usr/bin",
                SHELL: "/opt/homebrew/bin/fish",
            },
            platform: "darwin",
            translator,
        })[0]?.message).toContain("fish_add_path");
        expect(checkPathSetup(target, {
            cwd: "/repo",
            env: {
                PATH: "/usr/bin",
            },
            platform: "darwin",
            translator,
        })[0]?.message).toContain("shell config file");
    });

    test("rejects unstable source runtimes", async () => {
        const sourceRoot = await mkdtemp(
            join(process.cwd(), ".tmp-install-source-invalid-"),
        );
        const unstableBinaryPath = join(sourceRoot, "bun");

        try {
            await Bun.write(unstableBinaryPath, "binary\n");
            await chmod(unstableBinaryPath, 0o755);

            await expect(resolveInstallSource({
                argv0: "bun",
                execPath: unstableBinaryPath,
                main: join(process.cwd(), "index.ts"),
                pid: 123,
                platform: "darwin",
                tempDirectoryPath: "/tmp",
            })).rejects.toMatchObject({
                key: "errors.install.invalidSource",
            });

            await expect(resolveInstallSource({
                argv0: unstableBinaryPath,
                execPath: unstableBinaryPath,
                main: "/$bunfs/root/oo",
                pid: 123,
                platform: "darwin",
                tempDirectoryPath: process.cwd(),
            })).rejects.toMatchObject({
                key: "errors.install.invalidSource",
            });
        }
        finally {
            await rm(sourceRoot, { force: true, recursive: true });
        }
    });

    test("restores the previous windows installation when copy fails", async () => {
        const source = {
            displayPath: "C:\\source\\oo.exe",
            executablePath: "C:\\source\\oo.exe",
        };
        const target = {
            binDir: "C:\\Users\\Alice\\.local\\bin",
            binaryPath: "C:\\Users\\Alice\\.local\\bin\\oo.exe",
            displayBinDir: "C:\\Users\\Alice\\.local\\bin",
            displayBinaryPath: "C:\\Users\\Alice\\.local\\bin\\oo.exe",
            isWindows: true,
            platform: "win32" as const,
        };
        const renames: Array<{
            sourcePath: string;
            targetPath: string;
        }> = [];

        await expect(installBinary(
            source,
            target,
            {
                pid: 123,
            },
            {
                copyFile: async () => {
                    throw new Error("copy failed");
                },
                mkdir: async () => undefined,
                now: () => 1000,
                realpath: async (path) => {
                    if (path === target.binaryPath) {
                        return target.binaryPath;
                    }

                    return path;
                },
                rename: async (sourcePath, targetPath) => {
                    renames.push({
                        sourcePath,
                        targetPath,
                    });
                },
                rm: async () => undefined,
            },
        )).rejects.toMatchObject({
            key: "errors.install.writeFailed",
        });

        expect(renames).toEqual([
            {
                sourcePath: target.binaryPath,
                targetPath: `${target.binaryPath}.old.1000`,
            },
            {
                sourcePath: `${target.binaryPath}.old.1000`,
                targetPath: target.binaryPath,
            },
        ]);
    });
});

describe("runSelfInstall", () => {
    test("installs the current unix binary and warns when PATH is missing", async () => {
        if (process.platform === "win32") {
            return;
        }

        const sourceRoot = await mkdtemp(
            join(process.cwd(), ".tmp-oo-install-source-"),
        );
        const homeRoot = await mkdtemp(join(tmpdir(), "oo-install-home-"));
        const sourcePath = join(sourceRoot, "oo");
        const stdout = createTextBuffer();

        try {
            await Bun.write(sourcePath, "binary\n");
            await chmod(sourcePath, 0o755);

            await runSelfInstall(
                createInstallContext({
                    cwd: process.cwd(),
                    env: {
                        HOME: homeRoot,
                        PATH: "/usr/bin",
                        USERPROFILE: homeRoot,
                    },
                    stdout,
                }),
                {
                    runtime: {
                        argv0: sourcePath,
                        execPath: sourcePath,
                        main: "/$bunfs/root/oo",
                        pid: 42,
                        platform: process.platform,
                        tempDirectoryPath: tmpdir(),
                    },
                },
            );

            const target = resolveInstallTarget({
                env: {
                    HOME: homeRoot,
                    USERPROFILE: homeRoot,
                },
                platform: process.platform,
            });
            const targetStats = await lstat(target.binaryPath);

            expect(targetStats.isSymbolicLink()).toBeTrue();
            expect(await readlink(target.binaryPath)).toBe(sourcePath);
            expect(stdout.read()).toContain("Installing oo...");
            expect(stdout.read()).toContain("oo successfully installed!");
            expect(stdout.read()).toContain("Location: ~/.local/bin/oo");
            expect(stdout.read()).toContain("Setup notes:");
        }
        finally {
            await rm(sourceRoot, { force: true, recursive: true });
            await rm(homeRoot, { force: true, recursive: true });
        }
    });

    test("is idempotent when the binary is already installed", async () => {
        if (process.platform === "win32") {
            return;
        }

        const sourceRoot = await mkdtemp(
            join(process.cwd(), ".tmp-oo-install-source-"),
        );
        const homeRoot = await mkdtemp(join(tmpdir(), "oo-install-home-"));
        const sourcePath = join(sourceRoot, "oo");

        try {
            await Bun.write(sourcePath, "binary\n");
            await chmod(sourcePath, 0o755);

            const runtime = {
                argv0: sourcePath,
                execPath: sourcePath,
                main: "/$bunfs/root/oo",
                pid: 42,
                platform: process.platform,
                tempDirectoryPath: tmpdir(),
            } as const;
            const context = createInstallContext({
                cwd: process.cwd(),
                env: {
                    HOME: homeRoot,
                    PATH: [
                        "/usr/bin",
                        posix.join(homeRoot, ".local", "bin"),
                    ].join(":"),
                    USERPROFILE: homeRoot,
                },
            });

            await runSelfInstall(context, { runtime });
            const target = resolveInstallTarget({
                env: {
                    HOME: homeRoot,
                    USERPROFILE: homeRoot,
                },
                platform: process.platform,
            });
            const firstLinkTarget = await readlink(target.binaryPath);

            await runSelfInstall(context, { runtime });

            expect(await readlink(target.binaryPath)).toBe(firstLinkTarget);
            await verifyInstall(target);
        }
        finally {
            await rm(sourceRoot, { force: true, recursive: true });
            await rm(homeRoot, { force: true, recursive: true });
        }
    });

    test("wraps invalid-source failures in a user-facing install error", async () => {
        const context = createInstallContext({
            cwd: process.cwd(),
            env: {
                HOME: "/Users/alice",
                PATH: "/usr/bin",
            },
        });

        await expect(runSelfInstall(context, {
            runtime: {
                argv0: "bun",
                execPath: "/usr/local/bin/bun",
                main: join(process.cwd(), "index.ts"),
                pid: 42,
                platform: "darwin",
                tempDirectoryPath: "/tmp",
            },
            realpath: async path => path,
            stat: async () => createStatsStub({
                executable: true,
                file: true,
            }),
        })).rejects.toEqual(new CliUserError("errors.install.failed", 1, {
            reason:
                "Cannot self-install from the current runtime: executable path is not a stable local binary.",
        }));
    });
});

function createInstallContext(options: {
    cwd: string;
    env: Record<string, string | undefined>;
    stdout?: ReturnType<typeof createTextBuffer>;
}): CliExecutionContext {
    const stdout = options.stdout ?? createTextBuffer();
    const stderr = createTextBuffer();

    return {
        authStore: {
            clear() {},
            getActiveAccountId: async () => undefined,
            read: async () => ({
                auth: [],
                id: "",
            }),
            write: async () => undefined,
        },
        cacheStore: {
            close() {},
            clear: async () => undefined,
            delete: async () => false,
            deleteExpired: async () => 0,
            get: async () => undefined,
            getFilePath: () => "",
            set: async () => undefined,
        },
        catalog: {
            commands: [],
            descriptionKey: "app.description",
            globalOptions: [],
            name: "oo",
        },
        completionRenderer: {
            render: () => "",
        },
        currentLogFilePath: "",
        cwd: options.cwd,
        env: options.env,
        fetcher: async () => {
            throw new Error("fetcher should not run");
        },
        fileDownloadSessionStore: createNoopFileDownloadSessionStore(),
        fileUploadStore: createNoopFileUploadStore(),
        logger: pino({
            enabled: false,
        }),
        packageName: "@oomol-lab/oo-cli",
        settingsStore: {
            getFilePath: () => "",
            read: async () => ({}),
            write: async () => undefined,
        },
        stderr: stderr.writer,
        stdin: {
            off() {},
            on() {},
        },
        stdout: stdout.writer,
        translator: createTranslator("en"),
        version: "1.2.3",
    } as unknown as CliExecutionContext;
}

function createStatsStub(options: {
    directory?: boolean;
    executable?: boolean;
    file?: boolean;
    symbolicLink?: boolean;
}) {
    return {
        isDirectory: () => options.directory === true,
        isFile: () => options.file === true,
        isSymbolicLink: () => options.symbolicLink === true,
        mode: options.executable === true ? 0o755 : 0o644,
    };
}
