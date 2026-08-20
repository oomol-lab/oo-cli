import type { CacheStore } from "../contracts/cache.ts";
import type { FileDownloadSessionStore } from "../contracts/file-download-session-store.ts";
import type { FileUploadRecordStore } from "../contracts/file-upload-store.ts";
import type { SettingsStore } from "../contracts/settings-store.ts";

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
import { resolveManagedSkillAgentHomeDirectory } from "../commands/skills/managed-skill-agents.ts";
import { APP_NAME } from "../config/app-config.ts";
import { CliUserError } from "../contracts/cli.ts";
import { createTelemetryItemForTest } from "../telemetry/__tests__/helpers.ts";
import {
    telemetryInternalCommand,
    telemetryInternalEnvKey,
} from "../telemetry/constants.ts";
import {
    enqueueTelemetryBatchItem,
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../telemetry/outbox.ts";
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

    test("keeps presigned URL query values out of the argv log", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(
                [
                    "file",
                    "download",
                    "https://download.example.com/report.txt?signature=argv-secret",
                ],
                {
                    fetcher: async () => {
                        throw new Error("offline");
                    },
                },
            );

            const logContent = await readLatestLogContent(sandbox);

            expect(logContent).toContain("\"msg\":\"CLI command received.\"");
            expect(logContent).not.toContain("argv-secret");
            expect(logContent).toContain("signature=REDACTED");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("keeps secret positional values out of the argv log", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(
                ["variables", "create", "MY_VAR", "positional-secret-value"],
                {
                    fetcher: async () => new Response("{}", { status: 500 }),
                },
            );

            const logContent = await readLatestLogContent(sandbox);

            expect(logContent).toContain("\"msg\":\"CLI command received.\"");
            expect(logContent).not.toContain("positional-secret-value");
            expect(logContent).toContain("<redacted>");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("redacts secret positionals passed after a double dash", async () => {
        const sandbox = await createCliSandbox();

        try {
            await sandbox.run(
                ["variables", "create", "MY_VAR", "--", "-dash-secret-value"],
                {
                    fetcher: async () => new Response("{}", { status: 500 }),
                },
            );

            const logContent = await readLatestLogContent(sandbox);

            expect(logContent).toContain("\"msg\":\"CLI command received.\"");
            expect(logContent).not.toContain("dash-secret-value");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("executes published skill installation", async () => {
        const sandbox = await createCliSandbox();
        const originalCwd = process.cwd;
        const originalEnv = process.env;
        const stdout = createTextBuffer({
            isTTY: true,
        });
        const stderr = createTextBuffer();
        const universalHomeDirectory = resolveManagedSkillAgentHomeDirectory(sandbox.env, "universal");

        try {
            await writeAuthFile(sandbox);
            await mkdir(universalHomeDirectory, { recursive: true });
            process.cwd = () => sandbox.cwd;
            process.env = sandbox.env;

            const exitCode = await executeCli({
                argv: [
                    "skills",
                    "install",
                    "document-tools",
                ],
                cwd: sandbox.cwd,
                env: sandbox.env,
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);

                    if (request.url.includes("/package-info/")) {
                        return new Response(JSON.stringify({
                            packageName: "document-tools",
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

                    if (request.url.endsWith("/document-tools/-/meta/document-tools-0.0.3.tgz")) {
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

    test("deletes legacy sqlite download session files during cli startup", async () => {
        const sandbox = await createCliSandbox();

        try {
            const legacyDownloadSessionsFilePath = resolveStorePaths({
                appName: APP_NAME,
                env: sandbox.env,
                platform: process.platform,
            }).legacyDownloadSessionsFilePath;
            const legacyFilePaths = [
                legacyDownloadSessionsFilePath,
                `${legacyDownloadSessionsFilePath}-shm`,
                `${legacyDownloadSessionsFilePath}-wal`,
            ];

            await mkdir(dirname(legacyDownloadSessionsFilePath), { recursive: true });
            await Promise.all(legacyFilePaths.map(path => writeFile(path, "legacy")));

            const result = await sandbox.run(["--help"]);

            expect(result.exitCode).toBe(0);
            await Promise.all(legacyFilePaths.map(async (path) => {
                await expect(Bun.file(path).exists()).resolves.toBeFalse();
            }));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("skips managed skill synchronization when OO_SKILLS_SYNC_DISABLED is set", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_SKILLS_SYNC_DISABLED = "1";

        try {
            const universalHome = resolveManagedSkillAgentHomeDirectory(
                sandbox.env,
                "universal",
            );

            const result = await sandbox.run(["--help"]);

            expect(result.exitCode).toBe(0);
            // The always-provisioned universal host (~/.agents) must not be
            // materialized when synchronization is disabled.
            await expect(stat(universalHome)).rejects.toMatchObject({
                code: "ENOENT",
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

    test("hides install from root help while keeping direct install help available", async () => {
        const sandbox = await createCliSandbox();

        try {
            const rootHelp = await sandbox.run(["--help"]);
            const installHelp = await sandbox.run(["install", "--help"]);

            expect(rootHelp.stdout).not.toContain("install [options] [version]");
            expect(installHelp.stdout).toContain("Install one oo-managed CLI release");
            expect(installHelp.stdout).toContain("--force");
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

    test("records telemetry for invalid global inputs before store initialization", async () => {
        const sandbox = await createCliSandbox();

        try {
            const invalidLang = await sandbox.run(["--lang", "fr", "--help"]);
            const rows = readTelemetryRowsForTest(
                resolveSandboxTelemetryDirectory(sandbox),
            );
            const payload = parseTelemetryRowPayload(rows[0]!);

            expect(invalidLang.exitCode).toBe(2);
            expect(rows).toHaveLength(1);
            expect(payload).toMatchObject({
                properties: {
                    command_action: "invalid_argument",
                    command_full: "__parse__.invalid_argument",
                    command_group: "__parse__",
                    error_category: "user_error",
                    exit_code: 2,
                    parse_error_kind: "invalid_argument",
                    success: false,
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports the detected agent client in telemetry", async () => {
        const sandbox = await createCliSandbox();
        // @vercel/detect-agent reads process.env directly and AI_AGENT
        // outranks every other marker, so setting it keeps this test
        // deterministic no matter which host runs the suite.
        const originalAiAgent = process.env.AI_AGENT;

        try {
            process.env.AI_AGENT = "v0";

            const result = await sandbox.run(["config", "list"]);
            const rows = readTelemetryRowsForTest(
                resolveSandboxTelemetryDirectory(sandbox),
            );
            const payload = parseTelemetryRowPayload(rows[0]!);

            expect(result.exitCode).toBe(0);
            expect(rows).toHaveLength(1);
            expect(payload).toMatchObject({
                properties: {
                    agent_client: "v0",
                    command_full: "config.list",
                },
            });
        }
        finally {
            if (originalAiAgent === undefined) {
                delete process.env.AI_AGENT;
            }
            else {
                process.env.AI_AGENT = originalAiAgent;
            }

            await sandbox.cleanup();
        }
    });

    test("runs the internal telemetry flusher without recursive telemetry", async () => {
        const sandbox = await createCliSandbox();
        const stdout = createTextBuffer();
        const stderr = createTextBuffer();
        const telemetryDirectoryPath = resolveSandboxTelemetryDirectory(sandbox);
        let requestCount = 0;

        try {
            enqueueTelemetryBatchItem({
                directoryPath: telemetryDirectoryPath,
                item: createTelemetryItemForTest(1),
                nowMs: Date.now(),
            });

            const exitCode = await executeCli({
                argv: [telemetryInternalCommand],
                cwd: sandbox.cwd,
                env: {
                    ...sandbox.env,
                    [telemetryInternalEnvKey]: "1",
                },
                fetcher: async () => {
                    requestCount += 1;
                    return new Response("");
                },
                stderr: stderr.writer,
                stdout: stdout.writer,
                systemLocale: "en-US",
            });

            expect(exitCode).toBe(0);
            expect(requestCount).toBe(1);
            expect(stdout.read()).toBe("");
            expect(stderr.read()).toBe("");
            expect(readTelemetryRowsForTest(telemetryDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not treat the telemetry internal env alone as a flusher invocation", async () => {
        const sandbox = await createCliSandbox();

        try {
            sandbox.env[telemetryInternalEnvKey] = "1";

            const result = await sandbox.run(["config", "list"]);
            const rows = readTelemetryRowsForTest(
                resolveSandboxTelemetryDirectory(sandbox),
            );
            const payload = parseTelemetryRowPayload(rows[0]!);

            expect(result.exitCode).toBe(0);
            expect(rows).toHaveLength(1);
            expect(payload).toMatchObject({
                properties: {
                    command_full: "config.list",
                    success: true,
                },
            });
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
            const rows = readTelemetryRowsForTest(
                resolveSandboxTelemetryDirectory(sandbox),
            );
            const payload = parseTelemetryRowPayload(rows[0]!);

            expect(exitCode).toBe(1);
            expect(closeOrder).toEqual([
                "cache",
                "fileUpload",
                "fileDownloadSession",
            ]);
            expect(stderr.read()).toBe(
                "Unexpected error: settings read failed\n",
            );
            expect(rows).toHaveLength(1);
            expect(payload).toMatchObject({
                properties: {
                    command_full: "__parse__.__root__",
                    command_group: "__parse__",
                    error_category: "system_error",
                    exit_code: 1,
                    success: false,
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("honors telemetry opt-out when unrelated settings are invalid", async () => {
        const sandbox = await createCliSandbox();

        try {
            const settingsFilePath = resolveStorePaths({
                appName: APP_NAME,
                env: sandbox.env,
                platform: process.platform,
            }).settingsFilePath;

            await mkdir(dirname(settingsFilePath), { recursive: true });
            await Bun.write(
                settingsFilePath,
                [
                    "lang = 1",
                    "",
                    "[telemetry]",
                    "enabled = false",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(["config", "list"]);

            expect(result.exitCode).toBe(1);
            expect(readTelemetryRowsForTest(
                resolveSandboxTelemetryDirectory(sandbox),
            )).toEqual([]);
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
            return Promise.resolve(false);
        },
        deleteDownloadSessionsUpdatedBefore() {
            return Promise.resolve(0);
        },
        findDownloadSession() {
            return Promise.resolve(undefined);
        },
        findDownloadSessions() {
            return Promise.resolve([]);
        },
        getFilePath() {
            return "";
        },
        saveDownloadSession() {
            return Promise.resolve();
        },
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

function resolveSandboxTelemetryDirectory(sandbox: {
    env: Record<string, string | undefined>;
}): string {
    return join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry");
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
