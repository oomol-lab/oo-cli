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
});
