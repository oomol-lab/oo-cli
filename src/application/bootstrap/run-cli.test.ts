import type { CacheStore } from "../contracts/cache.ts";
import type { FileDownloadSessionStore } from "../contracts/file-download-session-store.ts";

import type { FileUploadRecordStore } from "../contracts/file-upload-store.ts";

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
    createCliSandbox,
    createCliSnapshot,
    createTextBuffer,
    readLatestLogContent,
} from "../../../__tests__/helpers.ts";
import packageManifest from "../../../package.json" with { type: "json" };
import { resolveStorePaths } from "../../adapters/store/store-path.ts";
import { APP_NAME } from "../config/app-config.ts";
import { CliUserError } from "../contracts/cli.ts";
import { createTerminalColors } from "../terminal-colors.ts";
import { executeCli } from "./run-cli.ts";

describe("runCli bootstrap", () => {
    test("keeps the cli command name aligned with package metadata", () => {
        expect(APP_NAME in packageManifest.bin).toBeTrue();
    });

    test("prints the package version", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["--version"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints localized version metadata in Chinese", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["--lang", "zh", "--version"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("creates the sqlite cache file during cli startup", async () => {
        const sandbox = await createCliSandbox();

        try {
            const cacheFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "data",
                "cache.sqlite",
            );
            const result = await sandbox.run(["--help"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            await expect(stat(cacheFilePath)).resolves.toMatchObject({
                isFile: expect.any(Function),
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("writes debug logs to the log directory during cli startup", async () => {
        const sandbox = await createCliSandbox();

        try {
            const logDirectoryPath = resolveStorePaths({
                appName: APP_NAME,
                env: sandbox.env,
                platform: process.platform,
            }).logDirectoryPath;
            const result = await sandbox.run(["--help"]);
            const logFileNames = await readdir(logDirectoryPath).catch(() => []);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(logFileNames.length).toBeGreaterThan(0);

            const content = await readFile(
                join(logDirectoryPath, logFileNames[0]!),
                "utf8",
            );
            const firstLine = content.split("\n")[0] ?? "";

            expect(firstLine).toContain(`"msg":"CLI command received."`);
            expect(firstLine).toContain(`"command":"--help"`);
            expect(content).toContain(`"msg":"CLI invocation started."`);
            expect(content).toContain(`"msg":"CLI invocation completed."`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints the current log file path to stderr when --debug is set", async () => {
        const sandbox = await createCliSandbox();

        try {
            const logDirectoryPath = resolveStorePaths({
                appName: APP_NAME,
                env: sandbox.env,
                platform: process.platform,
            }).logDirectoryPath;
            const result = await sandbox.run(["--debug", "--help"]);
            const logFileNames = await readdir(logDirectoryPath);
            const logFilePath = join(logDirectoryPath, logFileNames.at(-1)!);

            expect(createCliSnapshot(result, {
                replacements: [
                    {
                        placeholder: "<LOG_FILE_PATH>",
                        value: logFilePath,
                    },
                ],
            })).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders help in English and Chinese", async () => {
        const sandbox = await createCliSandbox();

        try {
            const englishHelp = await sandbox.run(["--help"]);
            const chineseHelp = await sandbox.run(["--lang", "zh", "--help"]);

            expect({
                chinese: createCliSnapshot(chineseHelp),
                english: createCliSnapshot(englishHelp),
            }).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders branded colors in help when stdout supports colors", async () => {
        const sandbox = await createCliSandbox();
        const colors = createTerminalColors(true);

        try {
            const result = await sandbox.run(
                ["--help"],
                {
                    stdout: {
                        hasColors: true,
                    },
                },
            );

            expect(createCliSnapshot(result, {
                stripAnsi: true,
            })).toMatchSnapshot();
            expect(result.stdout).toContain(
                `${colors.magenta(APP_NAME)} is ${colors.cyan("OOMOL")}'s CLI toolkit.`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("returns usage errors for invalid global inputs", async () => {
        const sandbox = await createCliSandbox();

        try {
            const invalidLang = await sandbox.run(["--lang", "fr", "--help"]);
            const unknownCommand = await sandbox.run(["cnfig"]);

            expect({
                invalidLang: createCliSnapshot(invalidLang),
                unknownCommand: createCliSnapshot(unknownCommand),
            }).toMatchSnapshot();
            expect(invalidLang.stderr).toContain("Invalid value for --lang");

            expect(unknownCommand.stderr).toContain("Unknown command");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("tags bootstrap user errors with the user_error category", async () => {
        const sandbox = await createCliSandbox();
        const stdout = createTextBuffer();
        const stderr = createTextBuffer();

        try {
            const exitCode = await executeCli({
                argv: ["config", "get", "lang"],
                cwd: sandbox.cwd,
                env: sandbox.env,
                settingsStore: {
                    getFilePath: () => "",
                    read: async () => {
                        throw new CliUserError("errors.config.invalidKey", 2, {
                            value: "theme",
                        });
                    },
                    update: async () => {
                        throw new Error("update should not be called");
                    },
                    write: async () => {
                        throw new Error("write should not be called");
                    },
                },
                stderr: stderr.writer,
                stdout: stdout.writer,
                systemLocale: "en-US",
            });
            const content = await readLatestLogContent(sandbox);

            expect(createCliSnapshot({
                exitCode,
                stderr: stderr.read(),
                stdout: stdout.read(),
            })).toMatchSnapshot();
            expect(stderr.read()).toContain("Invalid config key");
            expect(content).toContain(`"category":"user_error"`);
            expect(content).toContain(`"key":"errors.config.invalidKey"`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports cache store cleanup failures and keeps closing the remaining stores", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await runCleanupFailureScenario(sandbox, ["cache"]);

            expect(result.exitCode).toBe(1);
            expect(result.closeOrder).toEqual([
                "cache",
                "fileUpload",
                "fileDownloadSession",
            ]);
            expect(result.stderr).toBe(
                "Unexpected error: cache store close failed\n",
            );
            expect(result.logContent).toContain(
                "Failed to close the cache store cleanly.",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports file upload store cleanup failures and keeps closing the remaining stores", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await runCleanupFailureScenario(sandbox, [
                "fileUpload",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.closeOrder).toEqual([
                "cache",
                "fileUpload",
                "fileDownloadSession",
            ]);
            expect(result.stderr).toBe(
                "Unexpected error: file upload store close failed\n",
            );
            expect(result.logContent).toContain(
                "Failed to close the file upload store cleanly.",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports file download session store cleanup failures and keeps closing the remaining stores", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await runCleanupFailureScenario(sandbox, [
                "fileDownloadSession",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.closeOrder).toEqual([
                "cache",
                "fileUpload",
                "fileDownloadSession",
            ]);
            expect(result.stderr).toBe(
                "Unexpected error: file download session store close failed\n",
            );
            expect(result.logContent).toContain(
                "Failed to close the file download session store cleanly.",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("continues cleanup when multiple stores fail to close", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await runCleanupFailureScenario(sandbox, [
                "cache",
                "fileUpload",
                "fileDownloadSession",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.closeOrder).toEqual([
                "cache",
                "fileUpload",
                "fileDownloadSession",
            ]);
            expect(result.stderr).toBe([
                "Unexpected error: cache store close failed",
                "Unexpected error: file upload store close failed",
                "Unexpected error: file download session store close failed",
                "",
            ].join("\n"));
            expect(result.logContent).toContain(
                "Failed to close the cache store cleanly.",
            );
            expect(result.logContent).toContain(
                "Failed to close the file upload store cleanly.",
            );
            expect(result.logContent).toContain(
                "Failed to close the file download session store cleanly.",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

type CleanupResourceName
    = | "cache"
        | "fileUpload"
        | "fileDownloadSession";

async function runCleanupFailureScenario(
    sandbox: Awaited<ReturnType<typeof createCliSandbox>>,
    failingResources: readonly CleanupResourceName[],
): Promise<{
    closeOrder: CleanupResourceName[];
    exitCode: number;
    logContent: string;
    stderr: string;
}> {
    const stdout = createTextBuffer();
    const stderr = createTextBuffer();
    const closeOrder: CleanupResourceName[] = [];
    const resourceSet = new Set(failingResources);
    const exitCode = await executeCli({
        argv: ["--help"],
        cacheStore: createCleanupCacheStore(closeOrder, resourceSet),
        cwd: sandbox.cwd,
        env: sandbox.env,
        fileDownloadSessionStore: createCleanupFileDownloadSessionStore(
            closeOrder,
            resourceSet,
        ),
        fileUploadStore: createCleanupFileUploadStore(closeOrder, resourceSet),
        stdout: stdout.writer,
        stderr: stderr.writer,
        systemLocale: "en-US",
        version: packageManifest.version,
    });

    return {
        closeOrder,
        exitCode,
        logContent: await readLatestLogContent(sandbox),
        stderr: stderr.read(),
    };
}

function createCleanupCacheStore(
    closeOrder: CleanupResourceName[],
    resourceSet: Set<CleanupResourceName>,
): CacheStore {
    return {
        close() {
            closeOrder.push("cache");

            if (resourceSet.has("cache")) {
                throw new Error("cache store close failed");
            }
        },
        getCache() {
            return {
                clear() {},
                delete() {
                    return false;
                },
                get() {
                    return null;
                },
                has() {
                    return false;
                },
                set() {},
            };
        },
        getFilePath() {
            return "";
        },
    };
}

function createCleanupFileUploadStore(
    closeOrder: CleanupResourceName[],
    resourceSet: Set<CleanupResourceName>,
): FileUploadRecordStore {
    return {
        close() {
            closeOrder.push("fileUpload");

            if (resourceSet.has("fileUpload")) {
                throw new Error("file upload store close failed");
            }
        },
        deleteExpired() {
            return 0;
        },
        getFilePath() {
            return "";
        },
        list() {
            return [];
        },
        save() {},
    };
}

function createCleanupFileDownloadSessionStore(
    closeOrder: CleanupResourceName[],
    resourceSet: Set<CleanupResourceName>,
): FileDownloadSessionStore {
    return {
        close() {
            closeOrder.push("fileDownloadSession");

            if (resourceSet.has("fileDownloadSession")) {
                throw new Error("file download session store close failed");
            }
        },
        deleteDownloadSession() {
            return false;
        },
        deleteDownloadSessionsUpdatedBefore() {
            return 0;
        },
        findDownloadSession() {
            return undefined;
        },
        getFilePath() {
            return "";
        },
        saveDownloadSession() {},
    };
}
