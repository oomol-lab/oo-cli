import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    createConnectionRefusedError,
    createFailedToOpenSocketError,
    defaultAuthEndpoint,
    findLoginUrl,
    readAuthLoginUrlPrefix,
    readLatestLogContent,
    runPrintedAuthLogin,
    toRequest,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { createTerminalColors } from "../../terminal-colors.ts";
import { JSON_OUTPUT_SCHEMA_VERSION } from "../json-output.ts";

const loginUrlColor = "#c09ff5";

describe("auth CLI", () => {
    test("writes auth device login logs without persisting secrets", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1");
            const content = await readLatestLogContent(sandbox);

            expect(createAuthLoginSnapshot(result)).toMatchSnapshot();
            expect(content).toContain(
                `"msg":"Auth device login request started."`,
            );
            expect(content).toContain(
                `"msg":"Auth device login request completed."`,
            );
            expect(content).toContain(
                `"msg":"Auth device login completed successfully."`,
            );
            expect(content).toContain(
                `"msg":"Auth account persisted after device login."`,
            );
            expect(content).not.toContain("secret-1");
            expect(content).not.toContain("M0KO41");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("writes auth-store and auth status logs", async () => {
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
                ["auth", "status"],
                {
                    fetcher: async () => new Response(null, { status: 200 }),
                },
            );
            const content = await readLatestLogContent(sandbox);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(content).toContain(`"msg":"Auth store read completed."`);
            expect(content).toContain(`"msg":"Current auth account resolved."`);
            expect(content).toContain(`"msg":"Auth status request started."`);
            expect(content).toContain(`"msg":"Auth status request completed."`);
            expect(content).not.toContain("secret-1");
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

            expect({
                loginHelp: createCliSnapshot(loginHelp),
                logoutHelp: createCliSnapshot(logoutHelp),
            }).toMatchSnapshot();
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
            const firstLoginUrl = findLoginUrl(firstLogin.stdout);
            const secondLoginUrl = findLoginUrl(secondLogin.stdout);

            expect(firstLogin.exitCode).toBe(0);
            expect(new URL(firstLoginUrl!).searchParams.get("user_code")).toBe(
                "M0KO41",
            );
            expect(firstLoginUrl).toStartWith(
                readAuthLoginUrlPrefix(defaultAuthEndpoint),
            );
            expect(secondLogin.exitCode).toBe(0);
            expect(new URL(secondLoginUrl!).searchParams.get("user_code")).toBe(
                "M0KO41",
            );
            expect(secondLoginUrl).toStartWith(
                readAuthLoginUrlPrefix(defaultAuthEndpoint),
            );
            expect({
                firstLogin: createAuthLoginSnapshot(firstLogin),
                secondLogin: createAuthLoginSnapshot(secondLogin),
            }).toMatchSnapshot();
            expect(authFileContent.split("[[auth]]").length - 1).toBe(1);
            expect(authFileContent).toContain("id = \"user-1\"");
            expect(authFileContent).toContain("api_key = \"secret-2\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders device login instructions with a standalone URL", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1");
            const plainOutput = createTerminalColors(true).strip(result.stdout);
            const outputLines = plainOutput.split("\n");
            const loginUrl = findLoginUrl(result.stdout);

            expect(result.exitCode).toBe(0);
            expect(loginUrl).toBeTruthy();
            expect(outputLines[0]).toBe("Open this login URL in your browser:");
            expect(outputLines[1]).toBe(loginUrl);
            expect(outputLines[2]).toBe("Waiting for the device login to complete...");
            expect(new URL(loginUrl!).searchParams.get("user_code")).toBe(
                "M0KO41",
            );
            expectForbiddenDeviceLoginPhrases(plainOutput);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders localized device login instructions with a standalone URL", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1", {
                argv: ["--lang", "zh", "auth", "login"],
            });
            const plainOutput = createTerminalColors(true).strip(result.stdout);
            const outputLines = plainOutput.split("\n");
            const loginUrl = findLoginUrl(result.stdout);

            expect(result.exitCode).toBe(0);
            expect(loginUrl).toBeTruthy();
            expect(outputLines[0]).toBe("请在你的浏览器中打开此登录 URL：");
            expect(outputLines[1]).toBe(loginUrl);
            expect(outputLines[2]).toBe("正在等待 device login 完成...");
            expect(new URL(loginUrl!).searchParams.get("user_code")).toBe(
                "M0KO41",
            );
            expectForbiddenDeviceLoginPhrases(plainOutput);
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
            const loginUrl = findLoginUrl(result.stdout);

            expect(result.exitCode).toBe(0);
            expect(new URL(loginUrl!).searchParams.get("user_code")).toBe(
                "M0KO41",
            );
            expect(loginUrl).toStartWith(
                readAuthLoginUrlPrefix("staging.oomol.test"),
            );
            expect(createAuthLoginSnapshot(result)).toMatchSnapshot();
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
            const loginUrl = findLoginUrl(result.stdout);

            expect(result.exitCode).toBe(0);
            expect(new URL(loginUrl!).searchParams.get("user_code")).toBe(
                "M0KO41",
            );
            expect(loginUrl).toStartWith(
                readAuthLoginUrlPrefix(defaultAuthEndpoint),
            );
            expect(createAuthLoginSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports login with a session token", async () => {
        const sandbox = await createCliSandbox();
        const sessionToken = "session-1";
        const requests: Request[] = [];

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );
            const result = await sandbox.run(
                ["login", "--session-token", sessionToken],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);
                        const requestUrl = new URL(request.url);

                        requests.push(request);

                        if (
                            request.method === "GET"
                            && requestUrl.host === `api.${defaultAuthEndpoint}`
                            && requestUrl.pathname === "/v1/auth/fast_login/profile_with_session_token"
                            && requestUrl.searchParams.get("session_token") === sessionToken
                        ) {
                            return new Response(JSON.stringify({
                                api_key: "secret-1",
                                endpoint: defaultAuthEndpoint,
                                id: "0193438c-238f-703c-8754-e4a04e0be0c1",
                                name: "Alice",
                            }));
                        }

                        throw new Error(`Unexpected auth fast login request: ${request.method} ${requestUrl}`);
                    },
                },
            );
            const authFileContent = await readFile(authFilePath, "utf8");
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(result.stdout).not.toContain("Open this login URL");
            expect(result.stdout).not.toContain("Enter this code");
            expect(result.stdout).not.toContain("Waiting for the device login");
            expect(createCliSnapshot(result)).toEqual({
                exitCode: 0,
                stderr: "",
                stdout:
                    "✓ Logged in to oomol.com account Alice\n  - Active account: true\n",
            });
            expect(authFileContent).toContain("id = \"0193438c-238f-703c-8754-e4a04e0be0c1\"");
            expect(authFileContent).toContain("api_key = \"secret-1\"");
            expect(authFileContent).toContain("endpoint = \"oomol.com\"");
            expect(content).toContain(`"msg":"Auth fast login request started."`);
            expect(content).toContain(`"msg":"Auth fast login completed successfully."`);
            expect(content).toContain(`"msg":"Auth account persisted after fast login."`);
            expect(content).not.toContain(sessionToken);
            expect(content).not.toContain("secret-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports login with an API key", async () => {
        const sandbox = await createCliSandbox();
        const apiKey = "secret-api-1";
        const requests: Request[] = [];

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );
            const result = await sandbox.run(
                ["login", "--api-key", apiKey],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);
                        const requestUrl = new URL(request.url);

                        requests.push(request);

                        if (
                            request.method === "GET"
                            && requestUrl.host === `api.${defaultAuthEndpoint}`
                            && requestUrl.pathname === "/v1/users/profile"
                            && request.headers.get("Authorization") === apiKey
                        ) {
                            return new Response(JSON.stringify({
                                displayname: "Kevin Cui",
                                email: "bh@bugs.cc",
                                nickname: "Kevin Cui",
                                uid: "019343c2-c43d-710f-81b2-dfa68d3079de",
                                username: "BlackHole1",
                            }));
                        }

                        throw new Error(`Unexpected auth api key login request: ${request.method} ${requestUrl}`);
                    },
                },
            );
            const authFileContent = await readFile(authFilePath, "utf8");
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(result.stdout).not.toContain("Open this login URL");
            expect(result.stdout).not.toContain("Waiting for the device login");
            expect(createCliSnapshot(result)).toEqual({
                exitCode: 0,
                stderr: "",
                stdout:
                    "✓ Logged in to oomol.com account BlackHole1\n  - Active account: true\n",
            });
            expect(authFileContent).toContain("id = \"019343c2-c43d-710f-81b2-dfa68d3079de\"");
            expect(authFileContent).toContain("name = \"BlackHole1\"");
            expect(authFileContent).toContain("api_key = \"secret-api-1\"");
            expect(authFileContent).toContain("endpoint = \"oomol.com\"");
            expect(content).toContain(`"msg":"Auth api key login request started."`);
            expect(content).toContain(`"msg":"Auth api key login completed successfully."`);
            expect(content).toContain(`"msg":"Auth account persisted after api key login."`);
            expect(content).not.toContain(apiKey);
            expect(result.stdout).not.toContain(apiKey);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects combining --api-key with --session-token", async () => {
        const sandbox = await createCliSandbox();
        const authFilePath = join(
            sandbox.env.XDG_CONFIG_HOME!,
            APP_NAME,
            "auth.toml",
        );

        try {
            const result = await sandbox.run(
                ["login", "--api-key", "secret-api-1", "--session-token", "session-1"],
                {
                    fetcher: async () => {
                        throw new Error("No request should be made for conflicting login options.");
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("--api-key");
            expect(result.stderr).toContain("--session-token");
            expect(await Bun.file(authFilePath).exists()).toBeFalse();
            expect(result.stdout + result.stderr).not.toContain("secret-api-1");
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
            expect(new URL(plainLoginUrl!).searchParams.get("user_code")).toBe(
                "M0KO41",
            );
            expect(createAuthLoginSnapshot(login, {
                stripAnsi: true,
            })).toMatchSnapshot();
            expect(login.stdout).toContain(
                colors.hex(loginUrlColor)(plainLoginUrl!),
            );
            expect(login.stdout).not.toContain(colors.bold("M0KO41"));
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
            expect(createCliSnapshot(result)).toMatchSnapshot();
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
            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(authFileContent).toContain("id = \"\"");
            expect(authFileContent).not.toContain("id = \"user-1\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports auth info as an alias for auth status", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                ],
            });

            const statusResult = await sandbox.run(
                ["auth", "status", "--json"],
                {
                    fetcher: async () => new Response(null, { status: 200 }),
                },
            );
            const infoResult = await sandbox.run(
                ["auth", "info", "--json"],
                {
                    fetcher: async () => new Response(null, { status: 200 }),
                },
            );

            expect(infoResult.exitCode).toBe(0);
            expect(infoResult.stderr).toBe("");
            expect(infoResult.stdout).toBe(statusResult.stdout);
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
            expect(validRequests).toHaveLength(1);
            expect(validRequests[0]?.url).toBe("https://api.oomol.com/v1/users/profile");
            expect(validRequests[0]?.headers.get("Authorization")).toBe("secret-1");

            expect(invalidStatus.exitCode).toBe(0);
            expect({
                invalidStatus: createCliSnapshot(invalidStatus),
                validStatus: createCliSnapshot(validStatus),
            }).toMatchSnapshot();
            expect(invalidRequests).toHaveLength(1);
            expect(invalidRequests[0]?.url).toBe("https://api.oomol.com/v1/users/profile");
            expect(invalidRequests[0]?.headers.get("Authorization")).toBe("secret-1");
            expect(await readFile(authFilePath, "utf8")).toContain("api_key = \"secret-1\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports a sandbox hint when auth status cannot open a socket", async () => {
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
                ["auth", "status"],
                {
                    fetcher: async () => {
                        throw createFailedToOpenSocketError("network down");
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "Request failed (network-restricted sandbox, try requesting elevated permissions)",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports a sandbox hint when auth status connection is refused", async () => {
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
                ["auth", "status"],
                {
                    fetcher: async () => {
                        throw createConnectionRefusedError("connection refused");
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "Request failed (network-restricted sandbox, try requesting elevated permissions)",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("text lists all saved accounts with [active] marker on the active one", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                    { id: "user-2", name: "Bob", apiKey: "secret-2", endpoint: defaultAuthEndpoint },
                ],
            });
            const requests: Request[] = [];

            const result = await sandbox.run(
                ["auth", "status"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));
                        return new Response(null, { status: 200 });
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Logged in to oomol.com account Alice");
            expect(result.stdout).toContain("Accounts:");
            expect(result.stdout).toContain("Alice");
            expect(result.stdout).toContain("Bob");
            expect(result.stdout).toContain("[active]");
            // Only Alice (the active account) gets the [active] marker.
            expect(result.stdout).not.toContain("Bob [active]");
            // Only the active account is validated.
            expect(requests).toHaveLength(1);
            expect(requests[0]?.headers.get("Authorization")).toBe("secret-1");
            // API key values must never leak to stdout.
            expect(result.stdout).not.toContain("secret-1");
            expect(result.stdout).not.toContain("secret-2");
            expect(result.stdout).not.toContain("apiKey");
            expect(result.stdout).not.toContain("api_key");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("text lists saved accounts when the active id is missing from the store", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox, {
                activeId: "user-deleted",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                    { id: "user-2", name: "Bob", apiKey: "secret-2", endpoint: defaultAuthEndpoint },
                ],
            });
            const requests: Request[] = [];

            const result = await sandbox.run(
                ["auth", "status"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));
                        return new Response(null, { status: 200 });
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("active account is missing");
            expect(result.stdout).toContain("user-deleted");
            expect(result.stdout).toContain("Accounts:");
            expect(result.stdout).toContain("Alice");
            expect(result.stdout).toContain("Bob");
            // No account is active here.
            expect(result.stdout).not.toContain("[active]");
            // No API key validation happens without an active account.
            expect(requests).toHaveLength(0);
            expect(result.stdout).not.toContain("secret-1");
            expect(result.stdout).not.toContain("secret-2");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("text logged-out without saved accounts stays compact", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["auth", "status"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Not logged in to any OOMOL account.");
            expect(result.stdout).not.toContain("Accounts:");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("text logged-out with saved accounts still lists every account", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox, {
                activeId: "",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                    { id: "user-2", name: "Bob", apiKey: "secret-2", endpoint: defaultAuthEndpoint },
                ],
            });
            const requests: Request[] = [];

            const result = await sandbox.run(
                ["auth", "status"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));
                        return new Response(null, { status: 200 });
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Not logged in to any OOMOL account.");
            expect(result.stdout).toContain("Accounts:");
            expect(result.stdout).toContain("Alice");
            expect(result.stdout).toContain("Bob");
            // No account is active; no `[active]` marker should appear.
            expect(result.stdout).not.toContain("[active]");
            // No API key validation happens without an active account.
            expect(requests).toHaveLength(0);
            // Secrets must never leak to stdout.
            expect(result.stdout).not.toContain("secret-1");
            expect(result.stdout).not.toContain("secret-2");
            expect(result.stdout).not.toContain("apiKey");
            expect(result.stdout).not.toContain("api_key");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json logged-in returns active account with valid apiKeyStatus", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                    { id: "user-2", name: "Bob", apiKey: "secret-2", endpoint: defaultAuthEndpoint },
                ],
            });

            const result = await sandbox.run(
                ["auth", "status", "--json"],
                {
                    fetcher: async () => new Response(null, { status: 200 }),
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload).toEqual({
                status: "logged-in",
                activeAccountId: "user-1",
                accounts: [
                    {
                        id: "user-1",
                        name: "Alice",
                        endpoint: defaultAuthEndpoint,
                        active: true,
                        apiKeyStatus: "valid",
                    },
                    {
                        id: "user-2",
                        name: "Bob",
                        endpoint: defaultAuthEndpoint,
                        active: false,
                    },
                ],
            });
            expect(result.stdout).not.toContain("apiKey\"");
            expect(result.stdout).not.toContain("secret-1");
            expect(result.stdout).not.toContain("secret-2");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json maps HTTP 401 to apiKeyStatus invalid", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["auth", "status", "--json"],
                {
                    fetcher: async () => new Response(null, { status: 401 }),
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const accounts = payload.accounts as Array<Record<string, unknown>>;

            expect(accounts[0]?.apiKeyStatus).toBe("invalid");
            expect(result.stdout).not.toContain("secret-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json maps generic fetch error to apiKeyStatus request_failed", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["auth", "status", "--json"],
                {
                    fetcher: async () => {
                        throw new Error("network blip");
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const accounts = payload.accounts as Array<Record<string, unknown>>;

            expect(accounts[0]?.apiKeyStatus).toBe("request_failed");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json maps sandbox socket error to apiKeyStatus request_failed_sandbox", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["auth", "status", "--json"],
                {
                    fetcher: async () => {
                        throw createFailedToOpenSocketError("network down");
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;
            const accounts = payload.accounts as Array<Record<string, unknown>>;

            expect(accounts[0]?.apiKeyStatus).toBe("request_failed_sandbox");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json logged-out returns empty accounts when no auth file exists", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["auth", "status", "--json"]);

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload).toEqual({
                status: "logged-out",
                activeAccountId: null,
                accounts: [],
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json active-account-missing exposes stale id and excludes it from accounts", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-2", name: "Bob", apiKey: "secret-2", endpoint: defaultAuthEndpoint },
                ],
            });

            const result = await sandbox.run(["auth", "status", "--json"]);

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload).toEqual({
                status: "active-account-missing",
                activeAccountId: null,
                missingAccountId: "user-1",
                accounts: [
                    {
                        id: "user-2",
                        name: "Bob",
                        endpoint: defaultAuthEndpoint,
                        active: false,
                    },
                ],
            });
            expect(result.stdout).not.toContain("secret-2");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json --show-schema-version prepends schemaVersion", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["auth", "status", "--json", "--show-schema-version"],
                {
                    fetcher: async () => new Response(null, { status: 200 }),
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.schemaVersion).toBe(JSON_OUTPUT_SCHEMA_VERSION);
            expect(payload.status).toBe("logged-in");
            expect(result.stdout).not.toContain("secret-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--format xml exits 2 with format error", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["auth", "status", "--format", "xml"]);

            expect(result.exitCode).toBe(2);
            expect(result.stderr).not.toBe("");
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
            expect(await readFile(authFilePath, "utf8")).toContain("id = \"user-2\"");

            const secondResult = await sandbox.run(["auth", "switch"]);

            expect(secondResult.exitCode).toBe(0);
            expect(await readFile(authFilePath, "utf8")).toContain("id = \"user-3\"");

            const thirdResult = await sandbox.run(["auth", "switch"]);

            expect(thirdResult.exitCode).toBe(0);
            expect({
                firstSwitch: createCliSnapshot(firstResult),
                secondSwitch: createCliSnapshot(secondResult),
                thirdSwitch: createCliSnapshot(thirdResult),
            }).toMatchSnapshot();
            expect(await readFile(authFilePath, "utf8")).toContain("id = \"user-1\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--user switches by account id", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                    { id: "user-2", name: "Bob", apiKey: "secret-2", endpoint: defaultAuthEndpoint },
                    { id: "user-3", name: "Charlie", apiKey: "secret-3", endpoint: defaultAuthEndpoint },
                ],
            });

            const result = await sandbox.run(["auth", "switch", "--user", "user-3"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Switched active account for oomol.com to Charlie");
            expect(await readFile(authFilePath, "utf8")).toContain("id = \"user-3\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--user switches by unique account name (with -u short flag)", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                    { id: "user-2", name: "Bob", apiKey: "secret-2", endpoint: defaultAuthEndpoint },
                ],
            });

            const result = await sandbox.run(["auth", "switch", "-u", "Bob"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Switched active account for oomol.com to Bob");
            expect(await readFile(authFilePath, "utf8")).toContain("id = \"user-2\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--user fails with userAmbiguous when multiple accounts share the same name", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                    { id: "user-2", name: "Bob", apiKey: "secret-2", endpoint: defaultAuthEndpoint },
                    { id: "user-3", name: "Bob", apiKey: "secret-3", endpoint: defaultAuthEndpoint },
                ],
            });
            const before = await readFile(authFilePath, "utf8");

            const result = await sandbox.run(["auth", "switch", "--user", "Bob"]);

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("Multiple saved accounts have the name Bob");
            expect(result.stderr).toContain("--user <account-id>");
            // Auth file must not be rewritten.
            expect(await readFile(authFilePath, "utf8")).toBe(before);
            // Secrets must never leak to stdout/stderr.
            expect(result.stdout + result.stderr).not.toContain("secret-1");
            expect(result.stdout + result.stderr).not.toContain("secret-2");
            expect(result.stdout + result.stderr).not.toContain("secret-3");
            expect(result.stdout + result.stderr).not.toContain("apiKey");
            expect(result.stdout + result.stderr).not.toContain("api_key");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--user fails with userNotFound when no account matches", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                ],
            });
            const before = await readFile(authFilePath, "utf8");

            const result = await sandbox.run(["auth", "switch", "--user", "nope"]);

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("No saved account matches nope");
            expect(await readFile(authFilePath, "utf8")).toBe(before);
            expect(result.stdout + result.stderr).not.toContain("secret-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--user is idempotent when target is already active", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                    { id: "user-2", name: "Bob", apiKey: "secret-2", endpoint: defaultAuthEndpoint },
                ],
            });

            const result = await sandbox.run(["auth", "switch", "--user", "user-1"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Switched active account for oomol.com to Alice");
            expect(await readFile(authFilePath, "utf8")).toContain("id = \"user-1\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--user blank string fails without writing", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                    { id: "user-2", name: "Bob", apiKey: "secret-2", endpoint: defaultAuthEndpoint },
                ],
            });
            const before = await readFile(authFilePath, "utf8");

            const result = await sandbox.run(["auth", "switch", "--user", "   "]);

            // A whitespace-only --user is invalid input; the project's default
            // CLI input-error path exits 1. The invariant we care about is
            // that no switch is performed.
            expect(result.exitCode).not.toBe(0);
            expect(await readFile(authFilePath, "utf8")).toBe(before);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--user has precedence: id beats name when value matches both", async () => {
        const sandbox = await createCliSandbox();

        try {
            // user-2's name happens to equal user-1's id; --user "user-1" must
            // resolve to the id match (Alice), not the name match (Bob).
            const authFilePath = await writeAuthFile(sandbox, {
                activeId: "user-2",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                    { id: "user-2", name: "user-1", apiKey: "secret-2", endpoint: defaultAuthEndpoint },
                ],
            });

            const result = await sandbox.run(["auth", "switch", "--user", "user-1"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Switched active account for oomol.com to Alice");
            expect(await readFile(authFilePath, "utf8")).toContain("id = \"user-1\"");
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
            expect(createCliSnapshot(result, {
                stripAnsi: true,
            })).toMatchSnapshot();
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
});

function createAuthLoginSnapshot(
    result: {
        readonly exitCode: number;
        readonly stdout: string;
        readonly stderr: string;
    },
    options: {
        readonly stripAnsi?: boolean;
    } = {},
) {
    const loginUrl = findLoginUrl(result.stdout);

    return createCliSnapshot(result, {
        replacements: loginUrl === undefined
            ? []
            : [
                    {
                        placeholder: "<LOGIN_URL>",
                        value: loginUrl,
                    },
                ],
        stripAnsi: options.stripAnsi,
    });
}

function expectForbiddenDeviceLoginPhrases(output: string): void {
    for (const phrase of [
        "AI agents",
        "sandbox",
        "automation",
        "do not open",
        "must be logged in",
        "不要代为打开",
        "必须已登录",
    ]) {
        expect(output).not.toContain(phrase);
    }
}
