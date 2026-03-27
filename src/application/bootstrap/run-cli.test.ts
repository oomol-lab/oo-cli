import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox, createTextBuffer, readLatestLogContent } from "../../../__tests__/helpers.ts";
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

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Version: ${packageManifest.version}`,
                    "Build Time: unknown",
                    "Commit: unknown",
                    "",
                ].join("\n"),
            );
            expect(result.stderr).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints localized version metadata in Chinese", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["--lang", "zh", "--version"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `版本: ${packageManifest.version}`,
                    "构建时间: 未知",
                    "提交: 未知",
                    "",
                ].join("\n"),
            );
            expect(result.stderr).toBe("");
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

            expect(result.exitCode).toBe(0);
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

            expect(result.exitCode).toBe(0);
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

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe(`${logFilePath}\n`);
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

            expect(englishHelp.exitCode).toBe(0);
            expect(englishHelp.stdout).not.toContain("Usage:");
            expect(englishHelp.stdout).toContain("auth");
            expect(englishHelp.stdout).toContain("log");
            expect(englishHelp.stdout).toContain(`${APP_NAME} is OOMOL's CLI toolkit.`);
            expect(englishHelp.stdout).toContain("--debug");
            expect(englishHelp.stdout).toContain("--lang <lang>");
            expect(englishHelp.stdout).toContain(
                "Log in with a browser flow (alias for auth login)",
            );
            expect(englishHelp.stdout).toContain(
                "Log out the current account (alias for auth logout)",
            );

            expect(chineseHelp.exitCode).toBe(0);
            expect(chineseHelp.stdout).not.toContain("用法：");
            expect(chineseHelp.stdout).toContain("auth");
            expect(chineseHelp.stdout).toContain("log");
            expect(chineseHelp.stdout).toContain(`${APP_NAME} 是 OOMOL 的 CLI 工具集`);
            expect(chineseHelp.stdout).toContain("--debug");
            expect(chineseHelp.stdout).toContain("选项：");
            expect(chineseHelp.stdout).toContain(
                "通过浏览器登录（auth login 的别名）",
            );
            expect(chineseHelp.stdout).toContain(
                "登出当前账号（auth logout 的别名）",
            );
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

            expect(result.exitCode).toBe(0);
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

            expect(invalidLang.exitCode).toBe(2);
            expect(invalidLang.stderr).toContain("Invalid value for --lang");

            expect(unknownCommand.exitCode).toBe(2);
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

            expect(exitCode).toBe(2);
            expect(stderr.read()).toContain("Invalid config key");
            expect(content).toContain(`"category":"user_error"`);
            expect(content).toContain(`"key":"errors.config.invalidKey"`);
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
