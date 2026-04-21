import type { SelfUpdateProgressEvent } from "./progress.ts";
import { chmod, mkdir, readlink, realpath, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { describe, expect, test } from "bun:test";
import {
    createLogCapture,
    createTemporaryDirectory,
    expectCliUserError,
    useTemporaryDirectoryCleanup,
} from "../../../__tests__/helpers.ts";
import { createTranslator } from "../../i18n/translator.ts";
import {
    performSelfUpdateOperation,
    renderSelfUpdateLockBusyMessage,
} from "./core.ts";
import {
    resolveSelfUpdateLockFilePath,
    resolveSelfUpdatePaths,
    resolveSelfUpdateVersionFilePath,
} from "./paths.ts";

const { track: trackDirectory } = useTemporaryDirectoryCleanup();

describe("performSelfUpdateOperation", () => {
    test("localizes lock-busy messages", () => {
        const translator = createTranslator("zh");

        expect(renderSelfUpdateLockBusyMessage({
            ownerPid: 123,
            translator,
        })).toBe("另一个更新已在进行中（PID 123），请稍后再试。");
        expect(renderSelfUpdateLockBusyMessage({
            translator,
        })).toBe("另一个更新已在进行中，请稍后再试。");
    });

    test("re-activates an existing target version without downloading again", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-core");
        const env = createSelfUpdateEnv(rootDirectory);
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });
        const targetVersionPath = resolveSelfUpdateVersionFilePath(
            paths,
            "1.2.3",
        );
        const logCapture = createLogCapture();
        let fetchCount = 0;

        trackDirectory(rootDirectory);
        await mkdir(paths.versionsDirectory, { recursive: true });
        await writeManagedVersion(targetVersionPath);

        try {
            const result = await performSelfUpdateOperation({
                currentVersion: "1.0.0",
                forceReinstall: false,
                runtime: {
                    arch: process.arch,
                    env,
                    execPath: process.execPath,
                    fetcher: async () => {
                        fetchCount += 1;
                        throw new Error("binary download should not be called");
                    },
                    logger: logCapture.logger,
                    platform: process.platform,
                    processId: process.pid,
                },
                targetVersion: "1.2.3",
            });

            expect(result.status).toBe("installed");
            expect(fetchCount).toBe(0);

            if (process.platform === "win32") {
                await expect(Bun.file(paths.executablePath).exists()).resolves.toBeTrue();
            }
            else {
                const linkedTarget = await readlink(paths.executablePath);
                const resolvedLinkedTarget = await realpath(
                    linkedTarget.startsWith("/")
                        ? linkedTarget
                        : join(paths.executableDirectory, linkedTarget),
                );

                expect(resolvedLinkedTarget).toBe(await realpath(targetVersionPath));
            }
        }
        finally {
            logCapture.close();
        }
    });

    test("keeps versions protected by active locks during cleanup", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-cleanup");
        const env = createSelfUpdateEnv(rootDirectory);
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });
        const logCapture = createLogCapture();

        trackDirectory(rootDirectory);
        await Promise.all([
            mkdir(paths.locksDirectory, { recursive: true }),
            mkdir(paths.versionsDirectory, { recursive: true }),
        ]);
        await Promise.all([
            writeManagedVersion(resolveSelfUpdateVersionFilePath(paths, "1.0.0")),
            writeManagedVersion(resolveSelfUpdateVersionFilePath(paths, "2.0.0")),
            writeManagedVersion(resolveSelfUpdateVersionFilePath(paths, "9.9.9")),
            writeManagedVersion(resolveSelfUpdateVersionFilePath(paths, "0.5.0")),
            writeFile(
                resolveSelfUpdateLockFilePath(paths, "9.9.9"),
                `${JSON.stringify({
                    acquiredAt: new Date().toISOString(),
                    execPath: process.execPath,
                    pid: process.pid,
                    version: "9.9.9",
                })}\n`,
            ),
        ]);

        try {
            const result = await performSelfUpdateOperation({
                currentVersion: "1.0.0",
                forceReinstall: false,
                runtime: {
                    arch: process.arch,
                    env,
                    execPath: process.execPath,
                    fetcher: async () => {
                        throw new Error("binary download should not be called");
                    },
                    logger: logCapture.logger,
                    platform: process.platform,
                    processId: process.pid,
                },
                targetVersion: "2.0.0",
            });

            expect(result.status).toBe("installed");
            await expect(
                Bun.file(resolveSelfUpdateVersionFilePath(paths, "1.0.0")).exists(),
            ).resolves.toBeTrue();
            await expect(
                Bun.file(resolveSelfUpdateVersionFilePath(paths, "2.0.0")).exists(),
            ).resolves.toBeTrue();
            await expect(
                Bun.file(resolveSelfUpdateVersionFilePath(paths, "9.9.9")).exists(),
            ).resolves.toBeTrue();
            await expect(
                Bun.file(resolveSelfUpdateVersionFilePath(paths, "0.5.0")).exists(),
            ).resolves.toBeFalse();
        }
        finally {
            logCapture.close();
        }
    });

    test("attempts to uninstall a legacy package-manager install after activation", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-legacy");
        const env = {
            ...createSelfUpdateEnv(rootDirectory),
            OO_INSTALL_PACKAGE_MANAGER: "pnpm",
        };
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });
        const targetVersionPath = resolveSelfUpdateVersionFilePath(
            paths,
            "1.2.3",
        );
        const logCapture = createLogCapture();
        const invokedCommands: Array<{
            commandArguments: readonly string[];
            commandPath: string;
        }> = [];

        trackDirectory(rootDirectory);
        await mkdir(paths.versionsDirectory, { recursive: true });
        await writeManagedVersion(targetVersionPath);

        try {
            const result = await performSelfUpdateOperation({
                currentVersion: "1.0.0",
                forceReinstall: false,
                runtime: {
                    arch: process.arch,
                    env,
                    execPath: process.execPath,
                    fetcher: async () => {
                        throw new Error("binary download should not be called");
                    },
                    logger: logCapture.logger,
                    platform: process.platform,
                    processId: process.pid,
                    resolveCommandPath: commandName => `/mock/bin/${commandName}`,
                    runCommand: async (options) => {
                        invokedCommands.push({
                            commandArguments: options.commandArguments,
                            commandPath: options.commandPath,
                        });

                        return {
                            exitCode: 0,
                            signalCode: null,
                            stderr: "",
                            stdout: "",
                        };
                    },
                },
                targetVersion: "1.2.3",
            });

            expect(result.status).toBe("installed");
            expect(invokedCommands).toEqual([
                {
                    commandArguments: ["remove", "-g", "@oomol-lab/oo-cli"],
                    commandPath: "/mock/bin/pnpm",
                },
            ]);
        }
        finally {
            logCapture.close();
        }
    });

    test("rejects an invalid target version before creating self-update directories", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-invalid-version");
        const env = createSelfUpdateEnv(rootDirectory);
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });
        const logCapture = createLogCapture();

        trackDirectory(rootDirectory);

        try {
            const error = await expectCliUserError(
                performSelfUpdateOperation({
                    currentVersion: "1.0.0",
                    forceReinstall: true,
                    runtime: {
                        arch: process.arch,
                        env,
                        execPath: process.execPath,
                        fetcher: async () => {
                            throw new Error("binary download should not be called");
                        },
                        logger: logCapture.logger,
                        platform: process.platform,
                        processId: process.pid,
                    },
                    targetVersion: "../escape",
                }),
            );

            expect(error.key).toBe("errors.selfUpdate.invalidTargetVersion");
            await expect(Bun.file(paths.versionsDirectory).exists()).resolves.toBeFalse();
        }
        finally {
            logCapture.close();
        }
    });

    test("reports sequential stages for a downloaded self-update", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-progress");
        const env = createSelfUpdateEnv(rootDirectory);
        const logCapture = createLogCapture();
        const reportedStages: SelfUpdateProgressEvent[] = [];

        trackDirectory(rootDirectory);

        try {
            const result = await performSelfUpdateOperation({
                currentVersion: "1.0.0",
                forceReinstall: true,
                reportStage: event => reportedStages.push(event),
                runtime: {
                    arch: process.arch,
                    env,
                    execPath: process.execPath,
                    fetcher: async () => new Response("binary"),
                    logger: logCapture.logger,
                    platform: process.platform,
                    processId: process.pid,
                },
                targetVersion: "2.0.0",
            });

            expect(result.status).toBe("installed");
            expect(reportedStages).toEqual([
                {
                    stage: "prepare",
                    version: "2.0.0",
                },
                {
                    stage: "download",
                    version: "2.0.0",
                },
                {
                    stage: "activate",
                    version: "2.0.0",
                },
                {
                    stage: "verify",
                    version: "2.0.0",
                },
                {
                    stage: "cleanup",
                    version: "2.0.0",
                },
            ]);
        }
        finally {
            logCapture.close();
        }
    });

    test("times out a binary download that never produces a response", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-download-timeout");
        const env = createSelfUpdateEnv(rootDirectory);
        const logCapture = createLogCapture();

        trackDirectory(rootDirectory);

        try {
            const error = await expectCliUserError(
                performSelfUpdateOperation({
                    currentVersion: "1.0.0",
                    forceReinstall: true,
                    runtime: {
                        arch: process.arch,
                        downloadTimeoutMs: 5,
                        env,
                        execPath: process.execPath,
                        fetcher: async (_, init) => await new Promise<Response>((_, reject) => {
                            init?.signal?.addEventListener("abort", () => {
                                reject(new Error("aborted"));
                            });
                        }),
                        logger: logCapture.logger,
                        platform: process.platform,
                        processId: process.pid,
                    },
                    targetVersion: "2.0.0",
                }),
            );

            expect(error.key).toBe("errors.selfUpdate.downloadTimedOut");
        }
        finally {
            logCapture.close();
        }
    });

    test("retries stalled binary downloads up to three times", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-download-stall-retry");
        const env = createSelfUpdateEnv(rootDirectory);
        const logCapture = createLogCapture();
        let fetchCount = 0;

        trackDirectory(rootDirectory);

        try {
            const result = await performSelfUpdateOperation({
                currentVersion: "1.0.0",
                forceReinstall: true,
                runtime: {
                    arch: process.arch,
                    downloadStallMaxRetries: 3,
                    downloadStallTimeoutMs: 5,
                    downloadTimeoutMs: 100,
                    env,
                    execPath: process.execPath,
                    fetcher: async (_, init) => {
                        fetchCount += 1;

                        if (fetchCount < 4) {
                            return new Response(new ReadableStream<Uint8Array>({
                                start(controller) {
                                    init?.signal?.addEventListener("abort", () => {
                                        controller.error(new Error("aborted"));
                                    });
                                },
                            }));
                        }

                        return new Response("binary");
                    },
                    logger: logCapture.logger,
                    platform: process.platform,
                    processId: process.pid,
                },
                targetVersion: "2.0.0",
            });

            expect(result.status).toBe("installed");
            expect(fetchCount).toBe(4);
        }
        finally {
            logCapture.close();
        }
    });

    test("fails after exhausting stalled binary download retries", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-download-stall-fail");
        const env = createSelfUpdateEnv(rootDirectory);
        const logCapture = createLogCapture();
        let fetchCount = 0;

        trackDirectory(rootDirectory);

        try {
            const error = await expectCliUserError(
                performSelfUpdateOperation({
                    currentVersion: "1.0.0",
                    forceReinstall: true,
                    runtime: {
                        arch: process.arch,
                        downloadStallMaxRetries: 3,
                        downloadStallTimeoutMs: 5,
                        downloadTimeoutMs: 100,
                        env,
                        execPath: process.execPath,
                        fetcher: async (_, init) => {
                            fetchCount += 1;

                            return new Response(new ReadableStream<Uint8Array>({
                                start(controller) {
                                    init?.signal?.addEventListener("abort", () => {
                                        controller.error(new Error("aborted"));
                                    });
                                },
                            }));
                        },
                        logger: logCapture.logger,
                        platform: process.platform,
                        processId: process.pid,
                    },
                    targetVersion: "2.0.0",
                }),
            );

            expect(error.key).toBe("errors.selfUpdate.downloadStalled");
            expect(fetchCount).toBe(4);
        }
        finally {
            logCapture.close();
        }
    });

    test("reports reuse when a target version is already materialized", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-self-update-reuse");
        const env = createSelfUpdateEnv(rootDirectory);
        const paths = resolveSelfUpdatePaths({
            env,
            platform: process.platform,
        });
        const targetVersionPath = resolveSelfUpdateVersionFilePath(
            paths,
            "2.0.0",
        );
        const logCapture = createLogCapture();
        const reportedStages: SelfUpdateProgressEvent[] = [];

        trackDirectory(rootDirectory);
        await mkdir(paths.versionsDirectory, { recursive: true });
        await writeManagedVersion(targetVersionPath);

        try {
            const result = await performSelfUpdateOperation({
                currentVersion: "1.0.0",
                forceReinstall: false,
                reportStage: event => reportedStages.push(event),
                runtime: {
                    arch: process.arch,
                    env,
                    execPath: process.execPath,
                    fetcher: async () => {
                        throw new Error("binary download should not be called");
                    },
                    logger: logCapture.logger,
                    platform: process.platform,
                    processId: process.pid,
                },
                targetVersion: "2.0.0",
            });

            expect(result.status).toBe("installed");
            expect(reportedStages).toEqual([
                {
                    stage: "prepare",
                    version: "2.0.0",
                },
                {
                    stage: "reuse",
                    version: "2.0.0",
                },
                {
                    stage: "activate",
                    version: "2.0.0",
                },
                {
                    stage: "verify",
                    version: "2.0.0",
                },
                {
                    stage: "cleanup",
                    version: "2.0.0",
                },
            ]);
        }
        finally {
            logCapture.close();
        }
    });
});

function createSelfUpdateEnv(rootDirectory: string): Record<string, string | undefined> {
    return {
        APPDATA: join(rootDirectory, "appdata"),
        HOME: rootDirectory,
        TEMP: join(rootDirectory, "temp"),
        TMP: join(rootDirectory, "temp"),
        TMPDIR: join(rootDirectory, "tmpdir"),
        USERPROFILE: rootDirectory,
        XDG_CACHE_HOME: join(rootDirectory, "cache"),
        XDG_DATA_HOME: join(rootDirectory, "data"),
        XDG_RUNTIME_DIR: join(rootDirectory, "runtime"),
    };
}

async function writeManagedVersion(path: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "binary");

    if (process.platform !== "win32") {
        await chmod(path, 0o755);
    }
}
