import type { CacheStore } from "../contracts/cache.ts";
import type { FileDownloadSessionStore } from "../contracts/file-download-session-store.ts";
import type { FileUploadRecordStore } from "../contracts/file-upload-store.ts";
import type { SettingsStore } from "../contracts/settings-store.ts";

import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, test } from "bun:test";
import {
    createCliSandbox,
    createCliSnapshot,
    createInteractiveInput,
    createTextBuffer,
    readLatestLogContent,
    toRequest,
    writeAuthFile,
} from "../../../__tests__/helpers.ts";
import packageManifest from "../../../package.json" with { type: "json" };
import { resolveStorePaths } from "../../adapters/store/store-path.ts";
import { resolveCodexHomeDirectory } from "../commands/skills/bundled-skill-paths.ts";
import { APP_NAME } from "../config/app-config.ts";
import { CliUserError } from "../contracts/cli.ts";
import { createTerminalColors } from "../terminal-colors.ts";
import { createLazyInput, executeCli } from "./run-cli.ts";

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

    test("executes published skill installation with explicit --skill", async () => {
        const sandbox = await createCliSandbox();
        const originalCwd = process.cwd;
        const originalEnv = process.env;
        const stdout = createTextBuffer({
            isTTY: true,
        });
        const stderr = createTextBuffer();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);

        try {
            await writeAuthFile(sandbox);
            await mkdir(codexHomeDirectory, { recursive: true });
            process.cwd = () => sandbox.cwd;
            process.env = sandbox.env;

            const exitCode = await executeCli({
                argv: [
                    "skills",
                    "install",
                    "red-note-ng",
                    "--skill",
                    "writer",
                ],
                cwd: sandbox.cwd,
                env: sandbox.env,
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);

                    if (request.url.includes("/package-info/")) {
                        return new Response(JSON.stringify({
                            packageName: "red-note-ng",
                            version: "0.0.3",
                            skills: [
                                {
                                    description: "Optimize notes",
                                    name: "writer",
                                    title: "Writer",
                                },
                            ],
                        }));
                    }

                    if (request.url.endsWith("/red-note-ng/-/meta/red-note-ng-0.0.3.tgz")) {
                        return new Response(await new Bun.Archive({
                            "package/package/skills/writer/SKILL.md": "# Writer\n",
                        }, {
                            compress: "gzip",
                        }).bytes());
                    }

                    throw new Error(`Unexpected request: ${request.url}`);
                },
                stderr: stderr.writer,
                stdin: createInteractiveInput(),
                stdout: stdout.writer,
                systemLocale: "en-US",
            });
            const plainOutput = stripVTControlCharacters(stdout.read());

            expect(exitCode).toBe(0);
            expect(stderr.read()).toBe("");
            expect(plainOutput).toContain("Installed skill writer");
        }
        finally {
            process.cwd = originalCwd;
            process.env = originalEnv;
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

    test("closes initialized stores when bootstrap setup fails", async () => {
        const sandbox = await createCliSandbox();
        const stdout = createTextBuffer();
        const stderr = createTextBuffer();
        const closeOrder: CleanupResourceName[] = [];

        try {
            const exitCode = await executeCli({
                argv: ["config", "get", "lang"],
                cacheStore: createCleanupCacheStore(closeOrder, new Set()),
                cwd: sandbox.cwd,
                env: sandbox.env,
                fileDownloadSessionStore: createCleanupFileDownloadSessionStore(
                    closeOrder,
                    new Set(),
                ),
                fileUploadStore: createCleanupFileUploadStore(
                    closeOrder,
                    new Set(),
                ),
                settingsStore: createFailingSettingsStore(
                    new Error("settings read failed"),
                ),
                stderr: stderr.writer,
                stdout: stdout.writer,
                systemLocale: "en-US",
            });

            expect(exitCode).toBe(1);
            expect(closeOrder).toEqual([
                "cache",
                "fileUpload",
                "fileDownloadSession",
            ]);
            expect(stderr.read()).toBe(
                "Unexpected error: settings read failed\n",
            );
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
                "Failed to close a resource cleanly.",
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
                "Failed to close a resource cleanly.",
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
                "Failed to close a resource cleanly.",
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
                "Failed to close a resource cleanly.",
            );
            expect(result.logContent).toContain(
                "Failed to close a resource cleanly.",
            );
            expect(result.logContent).toContain(
                "Failed to close a resource cleanly.",
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

function createFailingSettingsStore(error: Error): SettingsStore {
    return {
        getFilePath() {
            return "";
        },
        async read() {
            throw error;
        },
        async update() {
            throw new Error("update should not be called");
        },
        async write() {
            throw new Error("write should not be called");
        },
    };
}

describe("createLazyInput", () => {
    test("does not call the factory until a property is accessed", () => {
        let called = false;
        const inner = createInteractiveInput();

        createLazyInput(() => {
            called = true;
            return inner;
        });

        expect(called).toBe(false);
    });

    test("calls the factory on first property access and caches the result", () => {
        let callCount = 0;
        const inner = createInteractiveInput();
        const lazy = createLazyInput(() => {
            callCount += 1;
            return inner;
        });

        void lazy.isTTY;
        void lazy.isTTY;

        expect(callCount).toBe(1);
    });

    test("delegates isTTY to the underlying input", () => {
        const inner = createInteractiveInput();
        const lazy = createLazyInput(() => inner);

        expect(lazy.isTTY).toBe(true);
    });

    test("delegates on and off to the underlying input", () => {
        const inner = createInteractiveInput();
        const lazy = createLazyInput(() => inner);
        const received: Array<string | Uint8Array> = [];
        const listener = (chunk: string | Uint8Array): void => {
            received.push(chunk);
        };

        lazy.on("data", listener);
        inner.feed("hello");

        expect(received.length).toBe(1);

        lazy.off("data", listener);
        inner.feed("world");

        expect(received.length).toBe(1);
    });
});
