import { Buffer } from "node:buffer";
import { readFile, stat } from "node:fs/promises";

import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { createCliSandbox, createTextBuffer } from "../../../__tests__/helpers.ts";
import packageManifest from "../../../package.json" with { type: "json" };
import { APP_NAME } from "../config/app-config.ts";
import { createTerminalColors } from "../terminal-colors.ts";
import { executeCli } from "./run-cli.ts";

const loginUrlColor = "#c09ff5";
const searchBlockTitleColor = "#CAA8FA";
const searchDisplayNameColor = "#59F78D";
const defaultAuthEndpoint = "oomol.com";

describe("runCli", () => {
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

    test("renders help in English and Chinese", async () => {
        const sandbox = await createCliSandbox();

        try {
            const englishHelp = await sandbox.run(["--help"]);
            const chineseHelp = await sandbox.run(["--lang", "zh", "--help"]);

            expect(englishHelp.exitCode).toBe(0);
            expect(englishHelp.stdout).not.toContain("Usage:");
            expect(englishHelp.stdout).toContain("auth");
            expect(englishHelp.stdout).toContain(`${APP_NAME} is OOMOL's CLI toolkit.`);
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
            expect(chineseHelp.stdout).toContain(`${APP_NAME} 是 OOMOL 的 CLI 工具集`);
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

    test("renders alias descriptions in login and logout help", async () => {
        const sandbox = await createCliSandbox();

        try {
            const loginHelp = await sandbox.run(["login", "--help"]);
            const logoutHelp = await sandbox.run(["logout", "--help"]);
            const loginDescriptionIndex = loginHelp.stdout.indexOf(
                "Log in with an OOMOL account in the browser.",
            );
            const loginAliasIndex = loginHelp.stdout.indexOf(
                "Alias for auth login.",
            );
            const logoutDescriptionIndex = logoutHelp.stdout.indexOf(
                "Remove the current account from persisted auth data.",
            );
            const logoutAliasIndex = logoutHelp.stdout.indexOf(
                "Alias for auth logout.",
            );

            expect(loginHelp.exitCode).toBe(0);
            expect(loginDescriptionIndex).toBeGreaterThanOrEqual(0);
            expect(loginAliasIndex).toBeGreaterThan(loginDescriptionIndex);

            expect(logoutHelp.exitCode).toBe(0);
            expect(logoutDescriptionIndex).toBeGreaterThanOrEqual(0);
            expect(logoutAliasIndex).toBeGreaterThan(logoutDescriptionIndex);
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

    test("renders supported shells in completion help", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["completion", "--help"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Target shell");
            expect(result.stdout).toContain("\"bash\"");
            expect(result.stdout).toContain("\"zsh\"");
            expect(result.stdout).toContain("\"fish\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders localized choices metadata in Chinese completion help", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["--lang", "zh", "completion", "--help"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("目标 shell");
            expect(result.stdout).toContain("(可选值: \"bash\", \"zsh\", \"fish\")");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("persists the configured locale and allows explicit override", async () => {
        const sandbox = await createCliSandbox();

        try {
            const setResult = await sandbox.run(["config", "set", "lang", "zh"]);
            const persistedHelp = await sandbox.run(["--help"]);
            const overriddenHelp = await sandbox.run(["--lang", "en", "--help"]);

            expect(setResult.exitCode).toBe(0);
            expect(setResult.stdout).toContain("Set lang to zh.");
            expect(persistedHelp.stdout).not.toContain("用法：");
            expect(overriddenHelp.stdout).not.toContain("Usage:");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports config path list get set and unset", async () => {
        const sandbox = await createCliSandbox();

        try {
            const configPathResult = await sandbox.run(["config", "path"]);
            const listBeforeSetResult = await sandbox.run(["config", "list"]);
            const setResult = await sandbox.run(["config", "set", "lang", "zh"]);
            const listAfterSetResult = await sandbox.run(["config", "list"]);
            const getResult = await sandbox.run(["config", "get", "lang"]);
            const unsetResult = await sandbox.run(["config", "unset", "lang"]);
            const listAfterUnsetResult = await sandbox.run(["config", "list"]);
            const getAfterUnsetResult = await sandbox.run(["config", "get", "lang"]);

            expect(configPathResult.exitCode).toBe(0);
            expect(configPathResult.stdout).toBe(
                `${join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml")}\n`,
            );
            expect(listBeforeSetResult.exitCode).toBe(0);
            expect(listBeforeSetResult.stdout).toBe("");
            expect(setResult.exitCode).toBe(0);
            expect(listAfterSetResult.exitCode).toBe(0);
            expect(listAfterSetResult.stdout).toBe("lang=zh\n");
            expect(getResult.stdout).toBe("zh\n");
            expect(unsetResult.exitCode).toBe(0);
            expect(listAfterUnsetResult.exitCode).toBe(0);
            expect(listAfterUnsetResult.stdout).toBe("");
            expect(getAfterUnsetResult.stdout).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders config list help with configured wording", async () => {
        const sandbox = await createCliSandbox();

        try {
            const englishConfigHelp = await sandbox.run(["config", "--help"]);
            const englishListHelp = await sandbox.run(["config", "list", "--help"]);
            const chineseConfigHelp = await sandbox.run(["--lang", "zh", "config", "--help"]);
            const chineseListHelp = await sandbox.run(["--lang", "zh", "config", "list", "--help"]);

            expect(englishConfigHelp.exitCode).toBe(0);
            expect(englishConfigHelp.stdout).toContain("List configured values");
            expect(englishConfigHelp.stdout).toContain("Show config file path");

            expect(englishListHelp.exitCode).toBe(0);
            expect(englishListHelp.stdout).toContain(
                "Print all persisted configuration values that are currently configured.",
            );

            expect(chineseConfigHelp.exitCode).toBe(0);
            expect(chineseConfigHelp.stdout).toContain("查看已配置的配置值");
            expect(chineseConfigHelp.stdout).toContain("显示配置文件路径");

            expect(chineseListHelp.exitCode).toBe(0);
            expect(chineseListHelp.stdout).toContain("查看当前已配置的全部持久化配置值。");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports auth login and updates the existing account without duplication", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );
            const firstLogin = await runPrintedAuthLogin(sandbox, "secret-1");
            const secondLogin = await runPrintedAuthLogin(sandbox, "secret-2");
            const authFileContent = await readFile(authFilePath, "utf8");

            expect(firstLogin.exitCode).toBe(0);
            expect(firstLogin.stdout).toContain(
                "Open this URL in your browser to continue:",
            );
            expect(firstLogin.stdout).toContain(
                readAuthLoginUrlPrefix(defaultAuthEndpoint),
            );
            expect(firstLogin.stdout).toContain("✓ Logged in to oomol.com account Alice");
            expect(firstLogin.stdout).toContain("  - Active account: true");
            expect(secondLogin.exitCode).toBe(0);
            expect(authFileContent.split("[[auth]]").length - 1).toBe(1);
            expect(authFileContent).toContain("id = \"user-1\"");
            expect(authFileContent).toContain("api_key = \"secret-2\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports auth login with a custom OOMOL_ENDPOINT", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OOMOL_ENDPOINT = "staging.oomol.test";

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1", {
                accountEndpoint: sandbox.env.OOMOL_ENDPOINT,
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                readAuthLoginUrlPrefix("staging.oomol.test"),
            );
            expect(result.stdout).toContain(
                "✓ Logged in to staging.oomol.test account Alice",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports login as an alias for auth login", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1", {
                argv: ["login"],
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "Open this URL in your browser to continue:",
            );
            expect(result.stdout).toContain("✓ Logged in to oomol.com account Alice");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders the auth login url and success block with color styling when stdout supports colors", async () => {
        const sandbox = await createCliSandbox();
        const colors = createTerminalColors(true);

        try {
            const login = await runPrintedAuthLogin(sandbox, "secret-1", {
                stdoutHasColors: true,
            });
            const plainLoginUrl = findLoginUrl(login.stdout);

            expect(login.exitCode).toBe(0);
            expect(plainLoginUrl).toBeTruthy();
            expect(login.stdout).toContain(
                colors.hex(loginUrlColor)(plainLoginUrl!),
            );
            expect(login.stdout).toContain(colors.green("✓"));
            expect(login.stdout).toContain(colors.bold("oomol.com"));
            expect(login.stdout).toContain(colors.bold("Alice"));
            expect(login.stdout).toContain(colors.bold("true"));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports auth logout without falling back to another account", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                    "[[auth]]",
                    "id = \"user-2\"",
                    "name = \"Bob\"",
                    "api_key = \"secret-2\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(["auth", "logout"]);
            const authFileContent = await readFile(authFilePath, "utf8");

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Logged out");
            expect(authFileContent).toContain("id = \"\"");
            expect(authFileContent).not.toContain("id = \"user-1\"");
            expect(authFileContent).toContain("id = \"user-2\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports logout as an alias for auth logout", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(["logout"]);
            const authFileContent = await readFile(authFilePath, "utf8");

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Logged out");
            expect(authFileContent).toContain("id = \"\"");
            expect(authFileContent).not.toContain("id = \"user-1\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports auth status for valid and invalid api keys", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );
            const validRequests: Request[] = [];
            const invalidRequests: Request[] = [];

            const validStatus = await sandbox.run(
                ["auth", "status"],
                {
                    fetcher: async (input, init) => {
                        validRequests.push(toRequest(input, init));
                        return new Response(null, { status: 200 });
                    },
                },
            );
            const invalidStatus = await sandbox.run(
                ["auth", "status"],
                {
                    fetcher: async (input, init) => {
                        invalidRequests.push(toRequest(input, init));
                        return new Response(null, { status: 401 });
                    },
                },
            );

            expect(validStatus.exitCode).toBe(0);
            expect(validStatus.stdout).toContain("✓ Logged in to oomol.com account Alice");
            expect(validStatus.stdout).toContain("  - Active account: true");
            expect(validStatus.stdout).toContain("  - API key status: Valid");
            expect(validStatus.stdout).not.toContain("saved_accounts=");
            expect(validRequests).toHaveLength(1);
            expect(validRequests[0]?.url).toBe("https://api.oomol.com/v1/users/profile");
            expect(validRequests[0]?.headers.get("Authorization")).toBe("secret-1");

            expect(invalidStatus.exitCode).toBe(0);
            expect(invalidStatus.stdout).toContain("X Logged in to oomol.com account Alice");
            expect(invalidStatus.stdout).toContain("  - API key status: Invalid");
            expect(invalidRequests).toHaveLength(1);
            expect(invalidRequests[0]?.url).toBe("https://api.oomol.com/v1/users/profile");
            expect(invalidRequests[0]?.headers.get("Authorization")).toBe("secret-1");
            expect(await readFile(authFilePath, "utf8")).toContain("api_key = \"secret-1\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports auth switch by activating the next saved account", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                    "[[auth]]",
                    "id = \"user-2\"",
                    "name = \"Bob\"",
                    "api_key = \"secret-2\"",
                    "endpoint = \"oomol.com\"",
                    "",
                    "[[auth]]",
                    "id = \"user-3\"",
                    "name = \"Charlie\"",
                    "api_key = \"secret-3\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const firstResult = await sandbox.run(["auth", "switch"]);

            expect(firstResult.exitCode).toBe(0);
            expect(firstResult.stdout).toContain(
                "✓ Switched active account for oomol.com to Bob",
            );
            expect(await readFile(authFilePath, "utf8")).toContain("id = \"user-2\"");

            const secondResult = await sandbox.run(["auth", "switch"]);

            expect(secondResult.exitCode).toBe(0);
            expect(secondResult.stdout).toContain(
                "✓ Switched active account for oomol.com to Charlie",
            );
            expect(await readFile(authFilePath, "utf8")).toContain("id = \"user-3\"");

            const thirdResult = await sandbox.run(["auth", "switch"]);

            expect(thirdResult.exitCode).toBe(0);
            expect(thirdResult.stdout).toContain(
                "✓ Switched active account for oomol.com to Alice",
            );
            expect(await readFile(authFilePath, "utf8")).toContain("id = \"user-1\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports search command with text output", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["search", "image processing"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            packages: [
                                {
                                    name: "@oomol/image-tools",
                                    version: "1.2.3",
                                    displayName: "Image Tools",
                                    description: "Powerful image processing toolkit",
                                    blocks: [
                                        {
                                            name: "image-processor",
                                            title: "Image Processor",
                                            description:
                                                "Process and transform image formats",
                                        },
                                    ],
                                },
                            ],
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "Image Tools (@oomol/image-tools@1.2.3)",
                    "Powerful image processing toolkit",
                    "Blocks:",
                    "- Image Processor (image-processor)",
                    "  Process and transform image formats",
                    "",
                ].join("\n"),
            );
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://search.oomol.com/v1/packages/-/intent-search?q=image+processing&lang=en",
            );
            expect(requests[0]?.headers.get("Authorization")).toBe("secret-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("adds the localized request language to search queries", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["--lang", "zh", "search", "image processing"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            packages: [],
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(
                new URL(requests[0]!.url).searchParams.get("lang"),
            ).toBe("zh-CN");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reuses cached search responses across cli invocations", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            let requestCount = 0;
            const fetcher = async () => {
                requestCount += 1;

                return new Response(JSON.stringify({
                    packages: [
                        {
                            name: "@oomol/image-tools",
                            version: "1.2.3",
                            displayName: "Image Tools",
                            description: "Powerful image processing toolkit",
                        },
                    ],
                }));
            };
            const firstResult = await sandbox.run(
                ["search", "image processing"],
                { fetcher },
            );
            const secondResult = await sandbox.run(
                ["search", "image processing"],
                { fetcher },
            );

            expect(firstResult.exitCode).toBe(0);
            expect(secondResult.exitCode).toBe(0);
            expect(firstResult.stdout).toBe(secondResult.stdout);
            expect(requestCount).toBe(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders search output with field-specific colors", async () => {
        const sandbox = await createCliSandbox();
        const colors = createTerminalColors(true);

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(
                ["search", "image processing"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        packages: [
                            {
                                name: "@oomol/image-tools",
                                version: "1.2.3",
                                displayName: "Image Tools",
                                description: "Powerful image processing toolkit",
                                blocks: [
                                    {
                                        name: "image-processor",
                                        title: "Image Processor",
                                        description:
                                            "Process and transform image formats",
                                    },
                                ],
                            },
                        ],
                    })),
                    stdout: {
                        hasColors: true,
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(createTerminalColors(true).strip(result.stdout)).toBe(
                [
                    "Image Tools (@oomol/image-tools@1.2.3)",
                    "Powerful image processing toolkit",
                    "Blocks:",
                    "- Image Processor (image-processor)",
                    "  Process and transform image formats",
                    "",
                ].join("\n"),
            );
            expect(result.stdout).toContain(
                `${colors.hex(searchDisplayNameColor)("Image Tools")} (@oomol/image-tools@1.2.3)`,
            );
            expect(result.stdout).toContain(
                `${colors.hex(searchBlockTitleColor)("Image Processor")} (image-processor)`,
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports search command with only-package-id text output", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(
                ["search", "image processing", "--only-package-id"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        packages: [
                            {
                                name: "@oomol/image-tools",
                                version: "1.2.3",
                                displayName: "Image Tools",
                                description: "Powerful image processing toolkit",
                            },
                            {
                                name: "@oomol/vision-kit",
                                version: "2.0.0",
                                displayName: "Vision Kit",
                            },
                        ],
                    })),
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "@oomol/image-tools@1.2.3",
                    "@oomol/vision-kit@2.0.0",
                    "",
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports search command with json array output and trims long text", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const rawResponse = JSON.stringify({
                packages: [
                    {
                        blocks: [
                            {
                                title: "Image Processor",
                            },
                        ],
                        displayName: "Image Tools",
                        name: "@oomol/image-tools",
                        version: "1.2.3",
                    },
                ],
                total: 1,
            });
            const requests: Request[] = [];
            const searchText = "x".repeat(210);
            const expectedQuery = "x".repeat(200);
            const result = await sandbox.run(
                ["search", searchText, "--json"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(rawResponse);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(JSON.stringify([
                {
                    blocks: [
                        {
                            title: "Image Processor",
                        },
                    ],
                    displayName: "Image Tools",
                    name: "@oomol/image-tools",
                    version: "1.2.3",
                },
            ]));
            expect(result.stderr).toBe("");
            expect(requests).toHaveLength(1);
            expect(
                new URL(requests[0]!.url).searchParams.get("q"),
            ).toBe(expectedQuery);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports search command with only-package-id json output", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(
                ["search", "image processing", "--format=json", "--only-package-id"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        packages: [
                            {
                                name: "@oomol/image-tools",
                                version: "1.2.3",
                                displayName: "Image Tools",
                            },
                            {
                                name: "@oomol/vision-kit",
                                version: "2.0.0",
                            },
                        ],
                    })),
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(JSON.stringify([
                "@oomol/image-tools@1.2.3",
                "@oomol/vision-kit@2.0.0",
            ]));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports package info command with text output", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["package", "info", "qrcode"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            packageName: "qrcode",
                            packageVersion: "1.0.4",
                            title: "QR Code",
                            description: "The QR Code Toolkit.",
                            blocks: [
                                {
                                    blockName: "Exist",
                                    title: "Exist QR Code",
                                    description: "Checks whether an image contains a QR code.",
                                    inputHandleDefs: [
                                        {
                                            group: "Image Input",
                                            collapsed: true,
                                        },
                                        {
                                            handle: "input",
                                            description: "Image input",
                                            value: "sample.png",
                                            json_schema: {
                                                "contentMediaType": "oomol/image",
                                                "anyOf": [
                                                    {
                                                        "type": "string",
                                                        "ui:widget": "text",
                                                    },
                                                ],
                                                "ui:options": {
                                                    labels: ["Base64 with Text"],
                                                },
                                            },
                                        },
                                        {
                                            handle: "tags",
                                            description: "Tag list",
                                            json_schema: {
                                                type: "array",
                                                items: {
                                                    type: "string",
                                                },
                                            },
                                        },
                                        {
                                            handle: "mode",
                                            description: "Scan mode",
                                            json_schema: {
                                                type: "string",
                                                default: "auto",
                                            },
                                        },
                                        {
                                            handle: "count",
                                            description: "Retry count",
                                            nullable: true,
                                            value: null,
                                            json_schema: {
                                                type: "integer",
                                            },
                                        },
                                    ],
                                    outputHandleDefs: [
                                        {
                                            handle: "output",
                                            description: "Boolean result",
                                            json_schema: {
                                                "type": "boolean",
                                                "ui:widget": "switch",
                                            },
                                        },
                                        {
                                            handle: "metadata",
                                            description: "Unstructured metadata",
                                            json_schema: {},
                                        },
                                    ],
                                },
                                {
                                    blockName: "Decode",
                                    title: "Decode QR Code",
                                    description: "Reads the QR code payload from an image.",
                                    inputHandleDefs: [
                                        {
                                            handle: "image",
                                            description: "Image to decode",
                                            json_schema: {
                                                type: "string",
                                                contentMediaType: "oomol/image",
                                            },
                                        },
                                    ],
                                    outputHandleDefs: [
                                        {
                                            handle: "text",
                                            description: "Decoded text payload",
                                            json_schema: {
                                                type: "string",
                                            },
                                        },
                                    ],
                                },
                            ],
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                [
                    "QR Code (qrcode@1.0.4)",
                    "The QR Code Toolkit.",
                    "",
                    "- Exist QR Code (Exist)",
                    "  Checks whether an image contains a QR code.",
                    "  Input:",
                    "    - input  string (image)  [optional]  Image input",
                    "    - tags   Array<string>   [required]  Tag list",
                    "    - mode   string          [optional]  Scan mode",
                    "    - count  integer         [optional]  Retry count",
                    "  Output:",
                    "    - output    boolean  Boolean result",
                    "    - metadata  unknown  Unstructured metadata",
                    "",
                    "- Decode QR Code (Decode)",
                    "  Reads the QR code payload from an image.",
                    "  Input:",
                    "    - image  string (image)  [required]  Image to decode",
                    "  Output:",
                    "    - text  string  Decoded text payload",
                    "",
                ].join("\n"),
            );
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://registry.oomol.com/-/oomol/package-info/qrcode/latest?lang=en",
            );
            expect(requests[0]?.headers.get("Authorization")).toBe("secret-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("includes input handle values in package info json output", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(
                ["package", "info", "qrcode@1.0.4", "--json"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        packageName: "qrcode",
                        packageVersion: "1.0.4",
                        title: "QR Code",
                        description: "The QR Code Toolkit.",
                        blocks: [
                            {
                                blockName: "Exist",
                                title: "Exist QR Code",
                                description: "Checks whether an image contains a QR code.",
                                inputHandleDefs: [
                                    {
                                        handle: "input",
                                        description: "Image input",
                                        nullable: false,
                                        value: "sample.png",
                                        json_schema: {
                                            type: "string",
                                        },
                                    },
                                    {
                                        handle: "placeholder",
                                        description: "Optional placeholder",
                                        nullable: true,
                                        value: null,
                                        json_schema: {
                                            type: "string",
                                        },
                                    },
                                    {
                                        handle: "excludes",
                                        description: "Excluded usernames",
                                        value: ["alice", "bob"],
                                        json_schema: {
                                            type: "array",
                                            items: {
                                                type: "string",
                                            },
                                        },
                                    },
                                    {
                                        handle: "count",
                                        description: "Winner count",
                                        value: 3,
                                        json_schema: {
                                            type: "integer",
                                        },
                                    },
                                    {
                                        handle: "tags",
                                        description: "Tag list",
                                        json_schema: {
                                            type: "array",
                                            items: {
                                                type: "string",
                                            },
                                        },
                                    },
                                ],
                                outputHandleDefs: [
                                    {
                                        handle: "output",
                                        description: "Boolean result",
                                        json_schema: {
                                            type: "boolean",
                                        },
                                    },
                                ],
                            },
                        ],
                    })),
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(JSON.parse(result.stdout)).toEqual({
                blocks: [
                    {
                        blockName: "Exist",
                        title: "Exist QR Code",
                        description: "Checks whether an image contains a QR code.",
                        inputHandle: {
                            input: {
                                description: "Image input",
                                nullable: false,
                                schema: {
                                    type: "string",
                                },
                                value: "sample.png",
                            },
                            placeholder: {
                                description: "Optional placeholder",
                                nullable: true,
                                schema: {
                                    type: "string",
                                },
                                value: null,
                            },
                            excludes: {
                                description: "Excluded usernames",
                                schema: {
                                    type: "array",
                                    items: {
                                        type: "string",
                                    },
                                },
                                value: ["alice", "bob"],
                            },
                            count: {
                                description: "Winner count",
                                schema: {
                                    type: "integer",
                                },
                                value: 3,
                            },
                            tags: {
                                description: "Tag list",
                                schema: {
                                    type: "array",
                                    items: {
                                        type: "string",
                                    },
                                },
                            },
                        },
                        outputHandle: {
                            output: {
                                description: "Boolean result",
                                schema: {
                                    type: "boolean",
                                },
                            },
                        },
                    },
                ],
                description: "The QR Code Toolkit.",
                displayName: "QR Code",
                packageName: "qrcode",
                packageVersion: "1.0.4",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports package info package specifier variants and json output", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const requests: Request[] = [];
            const cases = [
                {
                    argv: ["package", "info", "pdf@1.0.0", "--format=json"],
                    expectedUrl:
                        "https://registry.oomol.com/-/oomol/package-info/pdf/1.0.0?lang=en",
                    response: {
                        packageName: "pdf",
                        packageVersion: "1.0.0",
                        title: "PDF Toolkit",
                        description: "Inspect PDF files",
                        blocks: [],
                    },
                },
                {
                    argv: ["package", "info", "pdf", "--format=json"],
                    expectedUrl:
                        "https://registry.oomol.com/-/oomol/package-info/pdf/latest?lang=en",
                    response: {
                        packageName: "pdf",
                        packageVersion: "1.0.0",
                        title: "PDF Toolkit",
                        description: "Inspect PDF files",
                        blocks: [],
                    },
                },
                {
                    argv: ["package", "info", "@foo/epub", "--format=json"],
                    expectedUrl:
                        "https://registry.oomol.com/-/oomol/package-info/%40foo%2Fepub/latest?lang=en",
                    response: {
                        packageName: "@foo/epub",
                        packageVersion: "2.0.0",
                        title: "Scoped EPUB",
                        description: "Read EPUB packages",
                        blocks: [],
                    },
                },
                {
                    argv: ["package", "info", "@bar/epub@1.0.0", "--format=json"],
                    expectedUrl:
                        "https://registry.oomol.com/-/oomol/package-info/%40bar%2Fepub/1.0.0?lang=en",
                    response: {
                        packageName: "@bar/epub",
                        packageVersion: "1.0.0",
                        title: "Bar EPUB",
                        description: "Read EPUB packages",
                        blocks: [],
                    },
                },
                {
                    argv: ["package", "info", "@baz@md@latest", "--format=json"],
                    expectedUrl:
                        "https://registry.oomol.com/-/oomol/package-info/%40baz%40md/latest?lang=en",
                    response: {
                        packageName: "@baz@md",
                        packageVersion: "3.2.1",
                        title: "Baz Markdown",
                        description: "Read Markdown packages",
                        blocks: [],
                    },
                },
            ] as const;

            for (const testCase of cases) {
                const result = await sandbox.run(
                    [...testCase.argv],
                    {
                        fetcher: async (input, init) => {
                            requests.push(toRequest(input, init));

                            return new Response(JSON.stringify(testCase.response));
                        },
                    },
                );

                expect(result.exitCode).toBe(0);
                expect(result.stderr).toBe("");
                expect(JSON.parse(result.stdout)).toEqual({
                    blocks: [],
                    description: testCase.response.description,
                    displayName: testCase.response.title,
                    packageName: testCase.response.packageName,
                    packageVersion: testCase.response.packageVersion,
                });
            }

            expect(requests.map(request => request.url)).toEqual(
                cases.map(testCase => testCase.expectedUrl),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports cloud-task run with json output", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "cloud-task",
                    "run",
                    "qrcode@1.0.4",
                    "-b",
                    "Exist",
                    "-d",
                    "{\"count\":3}",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.startsWith("https://registry.")) {
                            return new Response(JSON.stringify({
                                packageName: "qrcode",
                                packageVersion: "1.0.4",
                                title: "QR Code",
                                description: "The QR Code Toolkit.",
                                blocks: [
                                    {
                                        blockName: "Exist",
                                        title: "Exist QR Code",
                                        description: "Checks whether an image contains a QR code.",
                                        inputHandleDefs: [
                                            {
                                                handle: "count",
                                                description: "Retry count",
                                                json_schema: {
                                                    type: "integer",
                                                },
                                            },
                                        ],
                                        outputHandleDefs: [],
                                    },
                                ],
                            }));
                        }

                        return new Response(JSON.stringify({
                            taskID: "550e8400-e29b-41d4-a716-446655440017",
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(JSON.parse(result.stdout)).toEqual({
                taskID: "550e8400-e29b-41d4-a716-446655440017",
            });
            expect(requests).toHaveLength(2);
            expect(requests[0]?.url).toBe(
                "https://registry.oomol.com/-/oomol/package-info/qrcode/1.0.4?lang=en",
            );
            expect(requests[1]?.url).toBe(
                "https://cloud-task.oomol.com/v3/users/me/tasks",
            );
            expect(requests[1]?.method).toBe("POST");
            expect(requests[1]?.headers.get("Authorization")).toBe("secret-1");
            expect(requests[1]?.headers.get("Content-Type")).toBe("application/json");
            await expect(requests[1]?.json()).resolves.toEqual({
                blockName: "Exist",
                inputValues: {
                    count: 3,
                },
                packageName: "qrcode",
                packageVersion: "1.0.4",
                type: "serverless",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports cloud-task run dry-run with @file payloads", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );
            const payloadPath = join(sandbox.cwd, "cloud-task-payload.txt");

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );
            await Bun.write(payloadPath, "{\"secret\":\"value\"}");

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "cloud-task",
                    "run",
                    "secret-tool@1.2.3",
                    "-b",
                    "main",
                    "-d",
                    `@${payloadPath}`,
                    "--dry-run",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        return new Response(JSON.stringify({
                            packageName: "secret-tool",
                            packageVersion: "1.2.3",
                            title: "Secret Tool",
                            description: "Handles secrets.",
                            blocks: [
                                {
                                    blockName: "main",
                                    title: "Main",
                                    description: "Runs the main block.",
                                    inputHandleDefs: [
                                        {
                                            handle: "secret",
                                            description: "Secret value",
                                            json_schema: {
                                                contentMediaType: "oomol/secret",
                                                type: "string",
                                            },
                                        },
                                    ],
                                    outputHandleDefs: [],
                                },
                            ],
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe("Validation passed.\n");
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://registry.oomol.com/-/oomol/package-info/secret-tool/1.2.3?lang=en",
            );
        }
        finally {
            await Bun.file(join(sandbox.cwd, "cloud-task-payload.txt")).delete();
            await sandbox.cleanup();
        }
    });

    test("supports cloud-task result, log, and list json output", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const requests: Request[] = [];
            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                const request = toRequest(input, init);

                requests.push(request);

                if (request.url.endsWith("/result")) {
                    return new Response(JSON.stringify({
                        resultData: { output: "ok" },
                        resultURL: "https://example.com/result.json",
                        status: "success",
                        traceID: "trace-1",
                    }));
                }

                if (request.url.includes("/logs")) {
                    return new Response(JSON.stringify({
                        logs: [
                            {
                                level: "info",
                                message: "running",
                            },
                        ],
                    }));
                }

                return new Response(JSON.stringify({
                    nextToken: "eyJsYXN0SWQiOiIxMjMifQ==",
                    tasks: [
                        {
                            blockName: "main",
                            createdAt: 1704067200000,
                            endTime: null,
                            failedMessage: null,
                            ownerID: "user-1",
                            packageID: "foo",
                            progress: 50,
                            resultURL: null,
                            schedulerPayload: {
                                type: "serverless",
                            },
                            startTime: null,
                            status: "running",
                            subscriptionID: null,
                            taskID: "550e8400-e29b-41d4-a716-446655440019",
                            taskType: "user",
                            updatedAt: 1704067200000,
                            workload: "serverless",
                            workloadID: "550e8400-e29b-41d4-a716-446655440020",
                        },
                    ],
                }));
            };

            const resultResponse = await sandbox.run(
                ["cloud-task", "result", "task-1", "--json"],
                {
                    fetcher,
                },
            );
            const logResponse = await sandbox.run(
                ["cloud-task", "log", "task-1", "--json", "--page=2"],
                {
                    fetcher,
                },
            );
            const listResponse = await sandbox.run(
                [
                    "cloud-task",
                    "list",
                    "--json",
                    "--size=1",
                    "--nextToken=eyJsYXN0SWQiOiIxMjMifQ==",
                    "--status=running",
                    "--package-name=foo",
                    "--block-name=main",
                ],
                {
                    fetcher,
                },
            );

            expect(resultResponse.exitCode).toBe(0);
            expect(JSON.parse(resultResponse.stdout)).toEqual({
                resultData: { output: "ok" },
                resultURL: "https://example.com/result.json",
                status: "success",
                traceID: "trace-1",
            });
            expect(logResponse.exitCode).toBe(0);
            expect(JSON.parse(logResponse.stdout)).toEqual({
                logs: [
                    {
                        level: "info",
                        message: "running",
                    },
                ],
            });
            expect(listResponse.exitCode).toBe(0);
            expect(JSON.parse(listResponse.stdout)).toEqual({
                nextToken: "eyJsYXN0SWQiOiIxMjMifQ==",
                tasks: [
                    {
                        blockName: "main",
                        createdAt: 1704067200000,
                        endTime: null,
                        failedMessage: null,
                        ownerID: "user-1",
                        packageID: "foo",
                        progress: 50,
                        resultURL: null,
                        schedulerPayload: {
                            type: "serverless",
                        },
                        startTime: null,
                        status: "running",
                        subscriptionID: null,
                        taskID: "550e8400-e29b-41d4-a716-446655440019",
                        taskType: "user",
                        updatedAt: 1704067200000,
                        workload: "serverless",
                        workloadID: "550e8400-e29b-41d4-a716-446655440020",
                    },
                ],
            });
            expect(requests.map(request => request.url)).toEqual([
                "https://cloud-task.oomol.com/v3/users/me/tasks/task-1/result",
                "https://cloud-task.oomol.com/v3/users/me/tasks/task-1/logs?page=2",
                "https://cloud-task.oomol.com/v3/users/me/tasks?size=1&nextToken=eyJsYXN0SWQiOiIxMjMifQ%3D%3D&status=running&packageID=foo&blockName=main",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("treats omitted input handles with default values as optional in cloud-task run", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "cloud-task",
                    "run",
                    "hash-tool@1.0.0",
                    "-b",
                    "main",
                    "-d",
                    "{}",
                    "--dry-run",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            packageName: "hash-tool",
                            packageVersion: "1.0.0",
                            title: "Hash Tool",
                            description: "Generate hash values.",
                            blocks: [
                                {
                                    blockName: "main",
                                    title: "Main",
                                    description: "Generate hash values from input text.",
                                    inputHandleDefs: [
                                        {
                                            handle: "input",
                                            description: "Input text",
                                            value: "",
                                            json_schema: {
                                                type: "string",
                                            },
                                        },
                                        {
                                            handle: "lowercased",
                                            description: "Lowercase output",
                                            value: false,
                                            json_schema: {
                                                type: "boolean",
                                            },
                                        },
                                    ],
                                    outputHandleDefs: [],
                                },
                            ],
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe("Validation passed.\n");
            expect(requests).toHaveLength(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("accepts omitted and empty --data values by treating them as empty objects", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const fetcher = async () => new Response(JSON.stringify({
                packageName: "hash-tool",
                packageVersion: "1.0.0",
                title: "Hash Tool",
                description: "Generate hash values.",
                blocks: [
                    {
                        blockName: "main",
                        title: "Main",
                        description: "Generate hash values from input text.",
                        inputHandleDefs: [
                            {
                                handle: "input",
                                description: "Input text",
                                value: "",
                                json_schema: {
                                    type: "string",
                                },
                            },
                            {
                                handle: "lowercased",
                                description: "Lowercase output",
                                value: false,
                                json_schema: {
                                    type: "boolean",
                                },
                            },
                        ],
                        outputHandleDefs: [],
                    },
                ],
            }));

            const omittedDataResult = await sandbox.run(
                [
                    "cloud-task",
                    "run",
                    "hash-tool@1.0.0",
                    "-b",
                    "main",
                    "--dry-run",
                ],
                {
                    fetcher,
                },
            );
            const emptyDataResult = await sandbox.run(
                [
                    "cloud-task",
                    "run",
                    "hash-tool@1.0.0",
                    "-b",
                    "main",
                    "-d",
                    "",
                    "--dry-run",
                ],
                {
                    fetcher,
                },
            );

            expect(omittedDataResult.exitCode).toBe(0);
            expect(omittedDataResult.stderr).toBe("");
            expect(omittedDataResult.stdout).toBe("Validation passed.\n");
            expect(emptyDataResult.exitCode).toBe(0);
            expect(emptyDataResult.stderr).toBe("");
            expect(emptyDataResult.stdout).toBe("Validation passed.\n");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders cloud-task result text output with colors and grouped details", async () => {
        const sandbox = await createCliSandbox();
        const colors = createTerminalColors(true);

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(
                ["cloud-task", "result", "task-1"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        resultData: {
                            output: "ok",
                        },
                        resultURL: "https://example.com/result.json",
                        status: "success",
                    })),
                    stdout: {
                        hasColors: true,
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(createTerminalColors(true).strip(result.stdout)).toBe(
                [
                    "✓ success",
                    "  Task ID: task-1",
                    "  Result URL: https://example.com/result.json",
                    "  Result data:",
                    "    {",
                    "      \"output\": \"ok\"",
                    "    }",
                    "",
                ].join("\n"),
            );
            expect(result.stdout).toContain(colors.green("✓"));
            expect(result.stdout).toContain(colors.green.bold("success"));
            expect(result.stdout).toContain(colors.bold("task-1"));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders cloud-task list text output with colors and summary blocks", async () => {
        const sandbox = await createCliSandbox();
        const colors = createTerminalColors(true);

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(
                ["cloud-task", "list", "--size=1"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        nextToken: "next-token",
                        tasks: [
                            {
                                blockName: "main",
                                createdAt: 1704067200000,
                                endTime: null,
                                failedMessage: null,
                                ownerID: "user-1",
                                packageID: "foo",
                                progress: 50,
                                resultURL: null,
                                schedulerPayload: {
                                    inputValues: {
                                        foo: "bar",
                                    },
                                    type: "serverless",
                                },
                                startTime: null,
                                status: "running",
                                subscriptionID: null,
                                taskID: "task-1",
                                taskType: "user",
                                updatedAt: 1704067200000,
                                workload: "serverless",
                                workloadID: "workload-1",
                            },
                        ],
                    })),
                    stdout: {
                        hasColors: true,
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(createTerminalColors(true).strip(result.stdout)).toBe(
                [
                    "▶ running",
                    "  Task ID: task-1",
                    "  Package/Block: foo / main",
                    "  Workload: serverless",
                    "  Progress: [=====-----] 50%",
                    "  Created: 2024-01-01T00:00:00.000Z",
                    "  Updated: 2024-01-01T00:00:00.000Z",
                    "  Input values:",
                    "    {",
                    "      \"foo\": \"bar\"",
                    "    }",
                    "",
                    "  Next token: next-token",
                    "",
                ].join("\n"),
            );
            expect(result.stdout).toContain(colors.blue("▶"));
            expect(result.stdout).toContain(colors.blue.bold("running"));
            expect(result.stdout).toContain(colors.hex(searchDisplayNameColor)("foo"));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("requires a package filter when cloud-task list receives a block filter", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(["cloud-task", "list", "--block-id=main"]);

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "You must provide --package-id (or --package-name) when using --block-id.\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reuses cached package info responses for explicit versions", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            let requestCount = 0;
            const fetcher = async () => {
                requestCount += 1;

                return new Response(JSON.stringify({
                    packageName: "qrcode",
                    packageVersion: "1.0.4",
                    title: "QR Code",
                    description: "The QR Code Toolkit.",
                    blocks: [],
                }));
            };

            const firstResult = await sandbox.run(
                ["package", "info", "qrcode@1.0.4"],
                { fetcher },
            );
            const secondResult = await sandbox.run(
                ["package", "info", "qrcode@1.0.4"],
                { fetcher },
            );

            expect(firstResult.exitCode).toBe(0);
            expect(secondResult.exitCode).toBe(0);
            expect(firstResult.stdout).toBe(secondResult.stdout);
            expect(requestCount).toBe(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not read latest package info lookups from cache and backfills the resolved version", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            let requestCount = 0;
            const fetcher = async () => {
                requestCount += 1;

                return new Response(JSON.stringify({
                    packageName: "qrcode",
                    packageVersion: "1.0.4",
                    title: "QR Code",
                    description: "The QR Code Toolkit.",
                    blocks: [],
                }));
            };

            const latestResult = await sandbox.run(
                ["package", "info", "qrcode"],
                { fetcher },
            );
            const latestAgainResult = await sandbox.run(
                ["package", "info", "qrcode"],
                { fetcher },
            );
            const explicitVersionResult = await sandbox.run(
                ["package", "info", "qrcode@1.0.4"],
                { fetcher },
            );

            expect(latestResult.exitCode).toBe(0);
            expect(latestAgainResult.exitCode).toBe(0);
            expect(explicitVersionResult.exitCode).toBe(0);
            expect(requestCount).toBe(2);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("validates the search format option", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["search", "image", "--format=yaml"]);

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain("Invalid format: yaml. Use json.");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports package info command help with the --json alias", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["package", "info", "--help"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("--json");
            expect(result.stdout).toContain("Alias for --format=json");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders search help when text argument is omitted", async () => {
        const sandbox = await createCliSandbox();

        try {
            const expectedHelp = await sandbox.run(["search", "--help"]);
            const result = await sandbox.run(["search"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(expectedHelp.stdout);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders the auth switch success block with gh-style emphasis when stdout supports colors", async () => {
        const sandbox = await createCliSandbox();
        const colors = createTerminalColors(true);

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                    "[[auth]]",
                    "id = \"user-2\"",
                    "name = \"Bob\"",
                    "api_key = \"secret-2\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(
                ["auth", "switch"],
                {
                    stdout: {
                        hasColors: true,
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(colors.green("✓"));
            expect(result.stdout).toContain(
                "Switched active account for oomol.com to",
            );
            expect(result.stdout).toContain(colors.bold("Bob"));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("creates a default settings file on first read", async () => {
        const sandbox = await createCliSandbox();

        try {
            const filePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "settings.toml",
            );

            const result = await sandbox.run(["config", "list"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe("");
            expect(await readFile(filePath, "utf8")).toBe(
                [
                    "# lang controls the CLI display language for help text, messages, and errors.",
                    "# Supported values: \"en\" (English), \"zh\" (Simplified Chinese).",
                    "# Default: auto-detect from LC_ALL, LC_MESSAGES, LANG, then system locale.",
                    "# lang = \"en\"",
                    "",
                    "# updateNotifier controls whether the CLI checks for newer releases and shows upgrade notices.",
                    "# Supported values: true, false.",
                    "# Default: true.",
                    "# updateNotifier = false",
                    "",
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("returns usage errors for invalid inputs", async () => {
        const sandbox = await createCliSandbox();

        try {
            const invalidLang = await sandbox.run(["--lang", "fr", "--help"]);
            const invalidKey = await sandbox.run(["config", "get", "theme"]);
            const invalidConfigValue = await sandbox.run(["config", "set", "lang", "fr"]);
            const invalidUpdateNotifierValue = await sandbox.run([
                "config",
                "set",
                "update-notifier",
                "maybe",
            ]);
            const unknownCommand = await sandbox.run(["cnfig"]);

            expect(invalidLang.exitCode).toBe(2);
            expect(invalidLang.stderr).toContain("Invalid value for --lang");

            expect(invalidKey.exitCode).toBe(2);
            expect(invalidKey.stderr).toContain("Invalid config key");
            expect(invalidKey.stderr).not.toContain("Supported keys");

            expect(invalidConfigValue.exitCode).toBe(2);
            expect(invalidConfigValue.stderr).toContain("Invalid lang value");

            expect(invalidUpdateNotifierValue.exitCode).toBe(2);
            expect(invalidUpdateNotifierValue.stderr).toContain(
                "Invalid update-notifier value",
            );

            expect(unknownCommand.exitCode).toBe(2);
            expect(unknownCommand.stderr).toContain("Unknown command");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("returns runtime errors when the persisted store is corrupted", async () => {
        const sandbox = await createCliSandbox();

        try {
            const filePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "settings.toml",
            );

            await Bun.write(filePath, "{");

            const result = await sandbox.run(["config", "get", "lang"]);

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("settings file");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reads TOML settings files", async () => {
        const sandbox = await createCliSandbox();

        try {
            const filePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "settings.toml",
            );

            await Bun.write(
                filePath,
                "lang = \"zh\"\n",
            );

            const result = await sandbox.run(["config", "get", "lang"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe("zh\n");
            expect(result.stderr).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

async function runPrintedAuthLogin(
    sandbox: Awaited<ReturnType<typeof createCliSandbox>>,
    apiKeyValue: string,
    options: {
        accountEndpoint?: string;
        argv?: readonly string[];
        stdoutHasColors?: boolean;
    } = {},
): Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
}> {
    const stdout = createTextBuffer({
        hasColors: options.stdoutHasColors,
    });
    const stderr = createTextBuffer();
    const execution = executeCli({
        argv: options.argv ?? ["auth", "login"],
        cwd: sandbox.cwd,
        env: sandbox.env,
        stdout: stdout.writer,
        stderr: stderr.writer,
        systemLocale: "en-US",
    });
    const loginUrl = await waitForLoginUrl(stdout);

    await completeLoginCallback(
        loginUrl,
        apiKeyValue,
        options.accountEndpoint ?? defaultAuthEndpoint,
    );

    return {
        exitCode: await execution,
        stdout: stdout.read(),
        stderr: stderr.read(),
    };
}

async function waitForLoginUrl(
    stdout: ReturnType<typeof createTextBuffer>,
): Promise<string> {
    const deadline = Date.now() + 1000;

    while (Date.now() < deadline) {
        const loginUrl = findLoginUrl(stdout.read());

        if (loginUrl !== undefined) {
            return loginUrl;
        }

        await Bun.sleep(10);
    }

    throw new Error("Timed out waiting for the printed login URL.");
}

function findLoginUrl(output: string): string | undefined {
    const plainOutput = createTerminalColors(true).strip(output);

    for (const line of plainOutput.split("\n")) {
        const urlStart = line.indexOf("https://");

        if (urlStart < 0) {
            continue;
        }

        const candidate = line.slice(urlStart).trim();

        if (candidate.includes("/v1/auth/redirect?")) {
            return candidate;
        }
    }

    return undefined;
}

async function completeLoginCallback(
    loginUrlValue: string,
    apiKeyValue: string,
    endpoint: string,
): Promise<void> {
    const loginUrl = new URL(loginUrlValue);

    expect(loginUrl.searchParams.get("cli_login")).toBe("true");

    const redirectUrl = loginUrl.searchParams.get("redirect");

    expect(redirectUrl).toBeTruthy();

    const callbackUrl = new URL(redirectUrl!);
    const requestUrl = new URL(callbackUrl.toString());
    const encodedApiKey = Buffer.from(apiKeyValue, "utf8").toString("base64");

    requestUrl.searchParams.set("apiKey", encodedApiKey);
    requestUrl.searchParams.set("name", "Alice");
    requestUrl.searchParams.set("endpoint", endpoint);
    requestUrl.searchParams.set("id", "user-1");

    const response = await fetch(requestUrl);

    expect(response.status).toBe(200);
}

function readAuthLoginUrlPrefix(endpoint: string): string {
    return `https://api.${endpoint}/v1/auth/redirect?`;
}

function toRequest(input: string | URL | Request, init?: RequestInit): Request {
    if (input instanceof Request) {
        return new Request(input, init);
    }

    return new Request(String(input), init);
}
