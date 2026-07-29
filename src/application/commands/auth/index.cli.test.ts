import type { Fetcher } from "../../contracts/cli.ts";
import { readFile } from "node:fs/promises";

import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    createConnectionRefusedError,
    createFailedToOpenSocketError,
    defaultAuthEndpoint,
    defaultLoginTeamsResponse,
    expectTelemetryFreeOfTeamIdentity,
    findLoginUrl,
    readAuthLoginUrlPrefix,
    readLatestLogContent,
    runPrintedAuthLogin,
    toRequest,
    writeAuthFile,
    writeAuthFileWithDefaultTeam,
    writeConnectorFile,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../telemetry/outbox.ts";
import { createTerminalColors } from "../../terminal-colors.ts";
import { JSON_OUTPUT_SCHEMA_VERSION } from "../command-output.ts";

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
            expect(content).toContain(`"msg":"Auth store tolerant read completed."`);
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

    test("supports auth login with a custom OO_ENDPOINT", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_ENDPOINT = "staging.oomol.test";

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1", {
                accountEndpoint: sandbox.env.OO_ENDPOINT,
            });
            const loginUrl = findLoginUrl(result.stdout);

            expect(result.exitCode).toBe(0);
            expect(loginUrl).toStartWith(
                readAuthLoginUrlPrefix("staging.oomol.test"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("ignores the removed legacy OOMOL_ENDPOINT variable", async () => {
        const sandbox = await createCliSandbox();

        // runPrintedAuthLogin only answers api.${accountEndpoint}; if login
        // still resolved the legacy host, the request would hit the unmocked
        // host and throw, so a green run proves OOMOL_ENDPOINT has no effect.
        sandbox.env.OOMOL_ENDPOINT = "legacy.oomol.test";

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1", {});
            const loginUrl = findLoginUrl(result.stdout);

            expect(result.exitCode).toBe(0);
            expect(loginUrl).toStartWith(
                readAuthLoginUrlPrefix("oomol.com"),
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

                        if (
                            request.method === "GET"
                            && requestUrl.host === `relation-control.${defaultAuthEndpoint}`
                            && requestUrl.pathname === "/v1/me/teams"
                        ) {
                            return new Response(
                                JSON.stringify(defaultLoginTeamsResponse),
                            );
                        }

                        throw new Error(`Unexpected auth fast login request: ${request.method} ${requestUrl}`);
                    },
                },
            );
            const authFileContent = await readFile(authFilePath, "utf8");
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(2);
            expect(result.stdout).not.toContain("Open this login URL");
            expect(result.stdout).not.toContain("Enter this code");
            expect(result.stdout).not.toContain("Waiting for the device login");
            expect(createCliSnapshot(result)).toEqual({
                exitCode: 0,
                stderr: "",
                stdout:
                    "✓ Logged in to oomol.com account Alice\n  - Active account: true\nDefault team identity: alice-team\n",
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

                        if (
                            request.method === "GET"
                            && requestUrl.host === `relation-control.${defaultAuthEndpoint}`
                            && requestUrl.pathname === "/v1/me/teams"
                        ) {
                            return new Response(
                                JSON.stringify(defaultLoginTeamsResponse),
                            );
                        }

                        throw new Error(`Unexpected auth api key login request: ${request.method} ${requestUrl}`);
                    },
                },
            );
            const authFileContent = await readFile(authFilePath, "utf8");
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(2);
            expect(result.stdout).not.toContain("Open this login URL");
            expect(result.stdout).not.toContain("Waiting for the device login");
            expect(createCliSnapshot(result)).toEqual({
                exitCode: 0,
                stderr: "",
                stdout:
                    "✓ Logged in to oomol.com account BlackHole1\n  - Active account: true\nDefault team identity: alice-team\n",
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

    test("logs in with an API key against the OO_ENDPOINT host", async () => {
        const sandbox = await createCliSandbox();
        const apiKey = "secret-api-1";
        const endpoint = "oomol.dev";
        const requests: Request[] = [];

        sandbox.env.OO_ENDPOINT = endpoint;

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
                            && requestUrl.host === `api.${endpoint}`
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

                        if (
                            request.method === "GET"
                            && requestUrl.host === `relation-control.${endpoint}`
                            && requestUrl.pathname === "/v1/me/teams"
                        ) {
                            return new Response(
                                JSON.stringify(defaultLoginTeamsResponse),
                            );
                        }

                        throw new Error(`Unexpected auth api key login request: ${request.method} ${requestUrl}`);
                    },
                },
            );
            const authFileContent = await readFile(authFilePath, "utf8");

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(2);
            expect(result.stdout).toContain("Logged in to oomol.dev");
            expect(authFileContent).toContain("endpoint = \"oomol.dev\"");
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

    test("--json reports the self-hosted connector from connector.toml while logged out", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeConnectorFile(sandbox, {
                url: "http://localhost:3000",
                token: "oct_status_secret",
            });

            const result = await sandbox.run(["auth", "status", "--json"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload).toEqual({
                status: "logged-out",
                activeAccountId: null,
                accounts: [],
                connector: {
                    url: "http://localhost:3000",
                    tokenConfigured: true,
                    source: "file",
                },
            });
            // Only the token presence is reported, never its value.
            expect(result.stdout).not.toContain("oct_status_secret");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json reports source env when OO_CONNECTOR_URL overrides connector.toml", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeConnectorFile(sandbox, {
                url: "http://localhost:3000",
                token: "oct_status_secret",
            });
            sandbox.env.OO_CONNECTOR_URL = "http://env-connector.local:4000";

            const result = await sandbox.run(["auth", "status", "--json"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            // The env override replaces the file config entirely, so the
            // file's token does not count as configured here.
            expect(payload).toEqual({
                status: "logged-out",
                activeAccountId: null,
                accounts: [],
                connector: {
                    url: "http://env-connector.local:4000",
                    tokenConfigured: false,
                    source: "env",
                },
            });
            expect(result.stdout).not.toContain("oct_status_secret");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json omits the connector key when no self-hosted connector is configured", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["auth", "status", "--json"]);

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload).not.toHaveProperty("connector");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("text shows the self-hosted connector block when configured", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeConnectorFile(sandbox, {
                url: "http://localhost:3000",
                token: "oct_status_secret",
            });

            const result = await sandbox.run(["auth", "status"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Not logged in to any OOMOL account.");
            expect(result.stdout).toContain(
                "Self-hosted connector: http://localhost:3000",
            );
            expect(result.stdout).toContain("Token configured: yes");
            expect(result.stdout).toContain("Source: file");
            // The token value itself must never appear in the output.
            expect(result.stdout).not.toContain("oct_status_secret");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json omits the connector key when connector.toml is corrupt", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeCorruptConnectorFile(sandbox);

            const result = await sandbox.run(["auth", "status", "--json"]);

            // Connector-store corruption must not take down the status
            // report; the connector block is simply omitted.
            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
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
});

describe("authCommand CLI self-hosted connector login hint", () => {
    test("login succeeds and prints the logout hint when connector.toml is configured", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeConnectorFile(sandbox, {
                url: "http://localhost:3000",
            });

            const result = await runPrintedAuthLogin(sandbox, "api-key-1");

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "Connector commands keep using your self-hosted connector at http://localhost:3000.",
            );
            expect(result.stdout).toContain("oo connector logout");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("login prints the env wording when OO_CONNECTOR_URL provides the connector", async () => {
        const sandbox = await createCliSandbox();

        try {
            sandbox.env.OO_CONNECTOR_URL = "http://env-connector.local:4000";

            const result = await runPrintedAuthLogin(sandbox, "api-key-1");

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "set via OO_CONNECTOR_URL",
            );
            // `oo connector logout` cannot remove an env-provided connector,
            // so the file-oriented hint must not appear.
            expect(result.stdout).not.toContain("oo connector logout");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("login still succeeds without the hint when connector.toml is corrupt", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeCorruptConnectorFile(sandbox);

            const result = await runPrintedAuthLogin(sandbox, "api-key-1");

            // Login already succeeded; a broken connector.toml must not flip
            // the exit code or block the success output.
            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("Logged in to");
            expect(result.stdout).not.toContain("self-hosted connector");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

describe("auth CLI OO_API_KEY override", () => {
    test("status text reports the env identity and marks no saved account active", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_API_KEY = "env-key-1";
        sandbox.env.OO_ENDPOINT = "oomol.dev";

        try {
            await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                    { id: "user-2", name: "Bob", apiKey: "secret-2", endpoint: defaultAuthEndpoint },
                ],
            });

            const result = await sandbox.run(
                ["auth", "status"],
                { fetcher: async () => new Response(null, { status: 200 }) },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "Logged in to oomol.dev with the API key from OO_API_KEY",
            );
            expect(result.stdout).toContain("API key status: Valid");
            expect(result.stdout).toContain(
                "Saved accounts are not in use while OO_API_KEY is set.",
            );
            // The saved active id must not win over the env credential.
            expect(result.stdout).not.toContain("[active]");
            expect(result.stdout).not.toContain("Not logged in");
            expect(result.stdout).toContain("Alice");
            expect(result.stdout).toContain("Bob");
            expectNoAuthSecrets(result.stdout);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("status text stays compact under OO_API_KEY without saved accounts", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_API_KEY = "env-key-1";

        try {
            const result = await sandbox.run(
                ["auth", "status"],
                { fetcher: async () => new Response(null, { status: 200 }) },
            );

            expect(result.exitCode).toBe(0);
            // The public default applies when OO_ENDPOINT is absent.
            expect(result.stdout).toContain(
                "Logged in to oomol.com with the API key from OO_API_KEY",
            );
            expect(result.stdout).not.toContain("Accounts:");
            expect(result.stdout).not.toContain(
                "Saved accounts are not in use",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("status validates the env credential against the OO_ENDPOINT host", async () => {
        const sandbox = await createCliSandbox();
        const requests: Request[] = [];

        sandbox.env.OO_API_KEY = "env-key-1";
        sandbox.env.OO_ENDPOINT = "oomol.dev";

        try {
            await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                ],
            });

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
            expect(requests).toHaveLength(1);
            // The saved account's key and host must not be used for validation.
            expect(requests[0]!.url).toBe("https://api.oomol.dev/v1/users/profile");
            expect(requests[0]!.headers.get("Authorization")).toBe("env-key-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json exposes the envOverride block and keeps saved accounts inactive", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_API_KEY = "env-key-1";
        sandbox.env.OO_ENDPOINT = "oomol.dev";

        try {
            await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                ],
            });

            const result = await sandbox.run(
                ["auth", "status", "--json"],
                { fetcher: async () => new Response(null, { status: 200 }) },
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                status: "logged-in",
                activeAccountId: "oo-env-override",
                accounts: [
                    {
                        id: "user-1",
                        name: "Alice",
                        endpoint: defaultAuthEndpoint,
                        active: false,
                    },
                ],
                envOverride: {
                    endpoint: "oomol.dev",
                    apiKeyStatus: "valid",
                },
            });
            expectNoAuthSecrets(result.stdout);
            expect(result.stdout).not.toContain("env-key-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json reports logged-in under OO_API_KEY even when the saved active id is stale", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_API_KEY = "env-key-1";

        try {
            await writeAuthFile(sandbox, {
                activeId: "user-missing",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                ],
            });

            const result = await sandbox.run(
                ["auth", "status", "--json"],
                { fetcher: async () => new Response(null, { status: 200 }) },
            );
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(result.exitCode).toBe(0);
            // A stale auth.toml id is irrelevant while the env credential wins.
            expect(payload.status).toBe("logged-in");
            expect(payload).not.toHaveProperty("missingAccountId");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("status does not create auth.toml under OO_API_KEY", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_API_KEY = "env-key-1";

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );
            const result = await sandbox.run(
                ["auth", "status"],
                { fetcher: async () => new Response(null, { status: 200 }) },
            );

            expect(result.exitCode).toBe(0);
            // OO_API_KEY's contract is that auth.toml is never read, required,
            // or written; authStore.read() would initialize it here.
            expect(await Bun.file(authFilePath).exists()).toBeFalse();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("status reports the env identity when auth.toml is corrupt", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_API_KEY = "env-key-1";
        sandbox.env.OO_ENDPOINT = "oomol.dev";

        try {
            const authFilePath = await writeCorruptAuthFile(sandbox);

            const result = await sandbox.run(
                ["auth", "status", "--json"],
                { fetcher: async () => new Response(null, { status: 200 }) },
            );

            // A file that is not the credential must not fail the report, and
            // --json must stay machine-readable.
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                status: "logged-in",
                activeAccountId: "oo-env-override",
                accounts: [],
                envOverride: {
                    endpoint: "oomol.dev",
                    apiKeyStatus: "valid",
                },
            });
            // The unreadable file is reported around, never repaired or erased.
            expect(await readFile(authFilePath, "utf8")).toContain(
                "not valid [ toml",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("status reports a corrupt auth.toml instead of failing", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeCorruptAuthFile(sandbox);

            const result = await sandbox.run(["auth", "status"]);

            // Status is the diagnostic command, so an unreadable file must be
            // reported — never a command failure, and never a silent empty
            // account list.
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("is unreadable");
            expect(result.stdout).toContain("Not logged in");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("status --format json keeps stdout machine-readable on a corrupt auth.toml", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeCorruptAuthFile(sandbox);

            const result = await sandbox.run(
                ["auth", "status", "--format", "json"],
            );

            // The corrupt-file warning must not contaminate the JSON payload;
            // diagnostics go to stderr.
            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                status: "logged-out",
                activeAccountId: null,
                accounts: [],
            });
            expect(result.stderr).toContain("is unreadable");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("logout does nothing and leaves auth.toml untouched under OO_API_KEY", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_API_KEY = "env-key-1";

        try {
            const authFilePath = await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                ],
            });
            const before = await readFile(authFilePath, "utf8");

            const result = await sandbox.run(["auth", "logout"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "Nothing was logged out: the active credential comes from OO_API_KEY, not from a saved account.",
            );
            expect(result.stdout).toContain(
                "Unset OO_API_KEY to manage saved accounts.",
            );
            expect(result.stdout).not.toContain("Logged out the current account.");
            // The saved account must survive a logout that could not log out.
            expect(await readFile(authFilePath, "utf8")).toBe(before);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("switch does nothing and leaves auth.toml untouched under OO_API_KEY", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_API_KEY = "env-key-1";

        try {
            const authFilePath = await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                    { id: "user-2", name: "Bob", apiKey: "secret-2", endpoint: defaultAuthEndpoint },
                ],
            });
            const before = await readFile(authFilePath, "utf8");

            const result = await sandbox.run(["auth", "switch", "--user", "Bob"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "Nothing was switched: the active credential comes from OO_API_KEY, not from a saved account.",
            );
            expect(result.stdout).toContain(
                "Unset OO_API_KEY to manage saved accounts.",
            );
            expect(result.stdout).not.toContain("Switched active account");
            expect(await readFile(authFilePath, "utf8")).toBe(before);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("switch reports the no-op instead of failing when no account is saved", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_API_KEY = "env-key-1";

        try {
            const result = await sandbox.run(["auth", "switch"]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Nothing was switched");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("login saves the account and warns that OO_API_KEY outranks it", async () => {
        const sandbox = await createCliSandbox();
        const apiKey = "secret-api-1";

        sandbox.env.OO_API_KEY = "env-key-1";

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );
            const result = await sandbox.run(
                ["auth", "login", "--api-key", apiKey],
                {
                    fetcher: async () =>
                        new Response(JSON.stringify({
                            displayname: "Kevin Cui",
                            email: "bh@bugs.cc",
                            nickname: "Kevin Cui",
                            uid: "019343c2-c43d-710f-81b2-dfa68d3079de",
                            username: "BlackHole1",
                        })),
                },
            );

            expect(result.exitCode).toBe(0);
            // Login still persists the account; only its effect is deferred.
            expect(await readFile(authFilePath, "utf8")).toContain(
                "name = \"BlackHole1\"",
            );
            expect(result.stdout).toContain(
                "Commands keep using the API key from OO_API_KEY, not this account. Unset OO_API_KEY to use the account you just saved.",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

describe("auth CLI OO_ENDPOINT override", () => {
    test("status reports and validates the redirected endpoint of a saved account", async () => {
        const sandbox = await createCliSandbox();
        const requests: Request[] = [];

        sandbox.env.OO_ENDPOINT = "oomol.dev";

        try {
            await writeAuthFile(sandbox, {
                activeId: "user-1",
                accounts: [
                    { id: "user-1", name: "Alice", apiKey: "secret-1", endpoint: defaultAuthEndpoint },
                ],
            });

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
            // A bare OO_ENDPOINT redirects every other command, so status must
            // not keep reporting (and validating against) the saved endpoint.
            expect(result.stdout).toContain("Logged in to oomol.dev account Alice");
            expect(requests).toHaveLength(1);
            expect(requests[0]!.url).toBe("https://api.oomol.dev/v1/users/profile");
            expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

function expectNoAuthSecrets(output: string): void {
    for (const secret of ["secret-1", "secret-2", "apiKey\"", "api_key"]) {
        expect(output).not.toContain(secret);
    }
}

async function writeCorruptAuthFile(
    sandbox: { env: Record<string, string | undefined> },
): Promise<string> {
    const filePath = join(
        sandbox.env.XDG_CONFIG_HOME!,
        APP_NAME,
        "auth.toml",
    );

    await Bun.write(filePath, "id = \"acct-1\"\nnot valid [ toml\n");

    return filePath;
}

async function writeCorruptConnectorFile(
    sandbox: { env: Record<string, string | undefined> },
): Promise<string> {
    const filePath = join(
        sandbox.env.XDG_CONFIG_HOME!,
        APP_NAME,
        "connector.toml",
    );

    await Bun.write(filePath, "url = \"http://localhost:3000\"\nnot valid [ toml");

    return filePath;
}

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

// Reads the command-specific telemetry properties recorded for the given
// command path, so tests can pin the safe property shape (enums/buckets only)
// and assert raw team identity never reaches telemetry.
function readCommandTelemetryProperties(
    sandbox: { env: Record<string, string | undefined> },
    commandFull: string,
): Record<string, unknown> | undefined {
    return readTelemetryRowsForTest(
        join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
    )
        .map(row => parseTelemetryRowPayload(row))
        .find(payload => payload?.properties?.command_full === commandFull)
        ?.properties;
}

describe("auth CLI login default team", () => {
    // The default team is stored on the saved account, so every assertion in
    // this block reads auth.toml rather than settings.toml.
    function readAuthFilePath(sandbox: {
        env: Record<string, string | undefined>;
    }): string {
        return join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "auth.toml");
    }

    async function readAuthContent(sandbox: {
        env: Record<string, string | undefined>;
    }): Promise<string> {
        return await readFile(readAuthFilePath(sandbox), "utf8");
    }

    test("adopts the system-created team and persists it as the default", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1");
            const authContent = await readAuthContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(
                "Default team identity: alice-team",
            );
            expect(result.stdout).not.toContain("You belong to");
            expect(authContent).toContain("team = \"alice-team\"");
            expect(authContent).toContain("team_id = \"team-system-1\"");

            // Only the selection enum and the bounded count reach telemetry.
            const telemetryProperties = readCommandTelemetryProperties(
                sandbox,
                "auth.login",
            );
            expect(telemetryProperties).toMatchObject({
                auth_method: "device_login",
                team_count_bucket: "1-5",
                team_selection: "system_default",
            });
            expectTelemetryFreeOfTeamIdentity(
                telemetryProperties,
                ["alice-team", "team-system-1"],
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists at most five team names and truncates the rest with an ellipsis", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1", {
                teamsResponse: {
                    teams: [
                        {
                            id: "team-system-1",
                            name: "alice-team",
                            role: "creator",
                            system_created: true,
                        },
                        { id: "team-2", name: "beta", role: "member", system_created: false },
                        { id: "team-3", name: "gamma", role: "member", system_created: false },
                        { id: "team-4", name: "delta", role: "member", system_created: false },
                        { id: "team-5", name: "epsilon", role: "member", system_created: false },
                        { id: "team-6", name: "zeta", role: "member", system_created: false },
                        { id: "team-7", name: "eta", role: "member", system_created: false },
                    ],
                },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "Default team identity: alice-team",
            );
            expect(result.stdout).toContain(
                "You belong to 7 teams: alice-team, beta, gamma, delta, epsilon, …. Switch with `oo team use <name>`.",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("sets the explicitly requested team with --team", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1", {
                argv: ["auth", "login", "--team", "beta"],
                teamsResponse: {
                    teams: [
                        {
                            id: "team-system-1",
                            name: "alice-team",
                            role: "creator",
                            system_created: true,
                        },
                        { id: "team-2", name: "beta", role: "member", system_created: false },
                    ],
                },
            });
            const authContent = await readAuthContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Default team identity: beta");
            expect(result.stdout).toContain(
                "You belong to 2 teams: alice-team, beta. Switch with `oo team use <name>`.",
            );
            expect(result.stdout).not.toContain("…");
            expect(authContent).toContain("team = \"beta\"");

            const telemetryProperties = readCommandTelemetryProperties(
                sandbox,
                "auth.login",
            );
            expect(telemetryProperties).toMatchObject({
                team_count_bucket: "1-5",
                team_selection: "flag",
            });
            expectTelemetryFreeOfTeamIdentity(
                telemetryProperties,
                ["alice-team", "beta", "team-system-1", "team-2"],
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails when the membership request fails under an explicit --team", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );
            const result = await runPrintedAuthLogin(sandbox, "secret-1", {
                argv: ["auth", "login", "--team", "beta"],
                teamsStatus: 500,
            });

            // The caller asked for exactly that team, so a failed membership
            // request must fail loudly instead of degrading to a hint.
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain(
                "The team list request returned HTTP 500.",
            );
            expect(await readFile(authFilePath, "utf8")).toContain(
                "id = \"user-1\"",
            );
            expect(await readAuthContent(sandbox)).not.toContain("\nteam = ");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails when the requested team is not a membership but keeps the login", async () => {
        const sandbox = await createCliSandbox();

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );
            const result = await runPrintedAuthLogin(sandbox, "secret-1", {
                argv: ["auth", "login", "--team", "ghost"],
            });

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain(
                "The active account cannot access the team \"ghost\".",
            );
            // The account itself logged in fine; only the team request failed.
            expect(await readFile(authFilePath, "utf8")).toContain(
                "id = \"user-1\"",
            );
            expect(await readAuthContent(sandbox)).not.toContain("\nteam = ");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects a blank --team value without starting a login", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["auth", "login", "--team", " "],
                {
                    fetcher: async () => {
                        throw new Error("No request should be made for a blank team.");
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("The team name must not be empty.");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("keeps the account's still-valid default team on re-login", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "beta");

            const result = await runPrintedAuthLogin(sandbox, "secret-1", {
                teamsResponse: {
                    teams: [
                        {
                            id: "team-system-1",
                            name: "alice-team",
                            role: "creator",
                            system_created: true,
                        },
                        { id: "team-2", name: "beta", role: "member", system_created: false },
                    ],
                },
            });
            const authContent = await readAuthContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Default team identity: beta");
            expect(authContent).toContain("team = \"beta\"");
            // The kept default gains the id it was missing, because this
            // login already fetched the membership listing.
            expect(authContent).toContain("team_id = \"team-2\"");

            const telemetryProperties = readCommandTelemetryProperties(
                sandbox,
                "auth.login",
            );
            expect(telemetryProperties).toMatchObject({
                team_count_bucket: "1-5",
                team_selection: "kept_existing",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("changes nothing when no system-created team matches", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "ghost");

            const result = await runPrintedAuthLogin(sandbox, "secret-1", {
                teamsResponse: {
                    teams: [{ id: "team-2", name: "beta", role: "member", system_created: false }],
                },
            });
            const authContent = await readAuthContent(sandbox);

            // No membership carries system_created, so the stale stored
            // default is left alone instead of being replaced or cleared.
            expect(result.exitCode).toBe(0);
            expect(result.stdout).not.toContain("Default team identity:");
            expect(authContent).toContain("team = \"ghost\"");
            expect(readCommandTelemetryProperties(sandbox, "auth.login"))
                .toMatchObject({ team_selection: "none" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("changes nothing when the account has no teams", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1", {
                teamsResponse: { teams: [] },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).not.toContain("Default team identity:");
            expect(result.stdout).not.toContain("You belong to");
            expect(await readAuthContent(sandbox)).not.toContain("\nteam = ");
            expect(readCommandTelemetryProperties(sandbox, "auth.login"))
                .toMatchObject({
                    team_count_bucket: "0",
                    team_selection: "none",
                });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("replaces a stale stored team with the system-created default", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "ghost");

            const result = await runPrintedAuthLogin(sandbox, "secret-1");
            const authContent = await readAuthContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "Default team identity: alice-team",
            );
            expect(authContent).toContain("team = \"alice-team\"");
            expect(authContent).not.toContain("team = \"ghost\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("keeps login successful when the team listing cannot be parsed", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1", {
                teamsResponse: "boom",
            });

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "Could not load your teams, so the default team identity is unchanged.",
            );
            expect(await readAuthContent(sandbox)).not.toContain("\nteam = ");

            // No membership data resolved, so no count bucket is recorded.
            const telemetryProperties = readCommandTelemetryProperties(
                sandbox,
                "auth.login",
            );
            expect(telemetryProperties).toMatchObject({
                team_selection: "unresolved",
            });
            expect(telemetryProperties).not.toHaveProperty("team_count_bucket");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints the env override hint when OO_TEAM_ID outranks the new default", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_TEAM_ID = "team-42";

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1");

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "Default team identity: alice-team",
            );
            expect(result.stdout).toContain(
                "Connector commands keep using the team from OO_TEAM_ID, not this default.",
            );
            // The default is still persisted; only its effect is deferred
            // while the env override is set.
            expect(await readAuthContent(sandbox)).toContain("team = \"alice-team\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints the env override hint naming OO_TEAM_NAME", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_TEAM_NAME = "other";

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1");

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "Connector commands keep using the team from OO_TEAM_NAME, not this default.",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports --team combined with --api-key login", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["auth", "login", "--api-key", "secret-api-1", "--team", "beta"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);
                        const requestUrl = new URL(request.url);

                        if (
                            request.method === "GET"
                            && requestUrl.host === `api.${defaultAuthEndpoint}`
                            && requestUrl.pathname === "/v1/users/profile"
                        ) {
                            return new Response(JSON.stringify({
                                displayname: "Alice",
                                email: "alice@example.com",
                                nickname: "Alice",
                                uid: "user-1",
                                username: "Alice",
                            }));
                        }

                        if (
                            request.method === "GET"
                            && requestUrl.host === `relation-control.${defaultAuthEndpoint}`
                            && requestUrl.pathname === "/v1/me/teams"
                        ) {
                            return new Response(JSON.stringify({
                                teams: [
                                    {
                                        id: "team-system-1",
                                        name: "alice-team",
                                        role: "creator",
                                        system_created: true,
                                    },
                                    { id: "team-2", name: "beta", role: "member", system_created: false },
                                ],
                            }));
                        }

                        throw new Error(`Unexpected api key login request: ${request.method} ${requestUrl}`);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("Default team identity: beta");
            expect(await readAuthContent(sandbox)).toContain("team = \"beta\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints localized team tips under --lang zh", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1", {
                argv: ["--lang", "zh", "auth", "login"],
                teamsResponse: {
                    teams: [
                        {
                            id: "team-system-1",
                            name: "alice-team",
                            role: "creator",
                            system_created: true,
                        },
                        { id: "team-2", name: "beta", role: "member", system_created: false },
                    ],
                },
            });

            // Pins the zh placeholder substitution ({team}/{count}/{teams});
            // a mistyped placeholder name would render literally.
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("当前默认团队身份：alice-team");
            expect(result.stdout).toContain(
                "你共有 2 个团队：alice-team, beta。可使用 `oo team use <name>` 切换。",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

describe("auth CLI status default team", () => {
    test("reports the configured default team in text and JSON", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "acme");

            const fetcher = async (): Promise<Response> =>
                new Response(null, { status: 200 });
            const textResult = await sandbox.run(["auth", "status"], { fetcher });
            const jsonResult = await sandbox.run(
                ["auth", "info", "--json"],
                { fetcher },
            );
            expect(textResult.exitCode).toBe(0);
            expect(textResult.stdout).toContain("- Default team: acme");
            expect(jsonResult.exitCode).toBe(0);
            // The account default already carries its name, so no lookup runs
            // and there is no status to report.
            expect(parseAuthStatusTeam(jsonResult.stdout)).toEqual({
                name: "acme",
                id: null,
                source: "account",
                status: null,
            });

            // Only the source enum reaches telemetry, never the team name.
            const telemetryProperties = readCommandTelemetryProperties(
                sandbox,
                "auth.status",
            );
            expect(telemetryProperties).toMatchObject({
                team_source: "account",
                team_status: "none",
            });
            expectTelemetryFreeOfTeamIdentity(telemetryProperties, ["acme"]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports the personal identity under OO_API_KEY despite a saved default", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_API_KEY = "env-key-1";

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "acme");

            const fetcher = async (): Promise<Response> =>
                new Response(null, { status: 200 });
            const textResult = await sandbox.run(["auth", "status"], { fetcher });
            const jsonResult = await sandbox.run(
                ["auth", "status", "--json"],
                { fetcher },
            );
            const payload = JSON.parse(jsonResult.stdout) as {
                status: string;
                envOverride?: unknown;
            };

            // OO_API_KEY may be a different account's credential, so no saved
            // default applies to it; pinning a team there means OO_TEAM_ID /
            // OO_TEAM_NAME.
            expect(textResult.exitCode).toBe(0);
            expect(textResult.stdout).toContain(
                "- Default team: personal (no default team)",
            );
            expect(payload.status).toBe("logged-in");
            expect(payload.envOverride).toBeDefined();
            expect(parseAuthStatusTeam(jsonResult.stdout)).toBeUndefined();

            expect(readCommandTelemetryProperties(sandbox, "auth.status"))
                .toMatchObject({ team_source: "none", team_status: "none" });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("resolves the OO_TEAM_ID override to its name ahead of the configured default", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_TEAM_ID = "team-42";

        try {
            await writeAuthFileWithDefaultTeam(sandbox, "acme");

            const requests: Request[] = [];
            const fetcher = createAuthStatusFetcher(requests);
            const textResult = await sandbox.run(["auth", "status"], { fetcher });
            const jsonResult = await sandbox.run(
                ["auth", "status", "--json"],
                { fetcher },
            );

            expect(textResult.exitCode).toBe(0);
            // The name is the new information; the id is what the reader put in
            // the environment, so both are shown.
            expect(textResult.stdout).toContain(
                "- Default team: platform (team-42) (via OO_TEAM_ID)",
            );
            expect(parseAuthStatusTeam(jsonResult.stdout)).toEqual({
                name: "platform",
                id: "team-42",
                source: "env_id",
                status: "valid",
            });
            // Two requests per run and no more: the key check and the name
            // lookup, which the command must not turn into a listing scan.
            expect(requests.map(request => request.url)).toEqual([
                "https://api.oomol.com/v1/users/profile",
                "https://relation-control.oomol.com/v1/teams/team-42",
                "https://api.oomol.com/v1/users/profile",
                "https://relation-control.oomol.com/v1/teams/team-42",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    // The status separates a misconfigured id from an unreachable backend; a
    // bare id with no explanation is the output this feature exists to remove.
    test.each([
        {
            httpStatus: 403,
            status: "not_a_member",
            reason: "the active account is not a member of this team",
        },
        {
            httpStatus: 404,
            status: "not_found",
            reason: "no team exists with this id",
        },
        {
            httpStatus: 410,
            status: "deleted",
            reason: "this team has been deleted",
        },
        {
            httpStatus: 500,
            status: "request_failed",
            reason: "could not look up the team",
        },
    ])(
        "reports OO_TEAM_ID lookup status $status for HTTP $httpStatus",
        async ({ httpStatus, status, reason }) => {
            const sandbox = await createCliSandbox();

            sandbox.env.OO_TEAM_ID = "team-42";

            try {
                await writeAuthFile(sandbox);

                const fetcher = createAuthStatusFetcher([], {
                    teamHttpStatus: httpStatus,
                });
                const textResult = await sandbox.run(["auth", "status"], { fetcher });
                const jsonResult = await sandbox.run(
                    ["auth", "status", "--json"],
                    { fetcher },
                );

                // A failed name lookup never fails the command, and never
                // downgrades the API key verdict either.
                expect(textResult.exitCode).toBe(0);
                expect(textResult.stdout).toContain("- API key status: Valid");
                // The id is kept so the reader can see what was tried, and the
                // reason lands last rather than between the id and its source.
                expect(textResult.stdout).toContain(
                    `- Default team: team-42 (via OO_TEAM_ID) — ${reason}`,
                );
                expect(parseAuthStatusTeam(jsonResult.stdout)).toEqual({
                    name: null,
                    id: "team-42",
                    source: "env_id",
                    status,
                });
                expect(readCommandTelemetryProperties(sandbox, "auth.status"))
                    .toMatchObject({ team_source: "env_id", team_status: status });
            }
            finally {
                await sandbox.cleanup();
            }
        },
    );

    test("resolves the OO_TEAM_NAME override to its id through the memberships", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_TEAM_NAME = "acme";

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const fetcher = createAuthStatusFetcher(requests);
            const textResult = await sandbox.run(["auth", "status"], { fetcher });
            const jsonResult = await sandbox.run(
                ["auth", "status", "--json"],
                { fetcher },
            );

            expect(textResult.stdout).toContain(
                "- Default team: acme (team-7) (via OO_TEAM_NAME)",
            );
            expect(parseAuthStatusTeam(jsonResult.stdout)).toEqual({
                name: "acme",
                id: "team-7",
                source: "env_name",
                status: "valid",
            });
            // Both env directions cost the same: the key check plus one team
            // lookup, sent concurrently, so the order is not part of the
            // contract.
            expect(requests.map(request => request.url).sort()).toEqual([
                "https://api.oomol.com/v1/users/profile",
                "https://api.oomol.com/v1/users/profile",
                "https://relation-control.oomol.com/v1/me/teams",
                "https://relation-control.oomol.com/v1/me/teams",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports an OO_TEAM_NAME missing from the memberships without failing", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_TEAM_NAME = "ghost";

        try {
            await writeAuthFile(sandbox);

            const fetcher = createAuthStatusFetcher([]);
            const textResult = await sandbox.run(["auth", "status"], { fetcher });
            const jsonResult = await sandbox.run(
                ["auth", "status", "--json"],
                { fetcher },
            );

            // Status keeps vouching only for identities connector commands
            // would accept: an inaccessible name is reported, not endorsed.
            expect(textResult.exitCode).toBe(0);
            expect(textResult.stdout).toContain(
                "- Default team: ghost (via OO_TEAM_NAME) — the active account is not a member of this team",
            );
            expect(parseAuthStatusTeam(jsonResult.stdout)).toEqual({
                name: "ghost",
                id: null,
                source: "env_name",
                status: "not_a_member",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("omits the team field from JSON when no default is configured", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const jsonResult = await sandbox.run(
                ["auth", "status", "--json"],
                {
                    fetcher: async () => new Response(null, { status: 200 }),
                },
            );
            const payload = JSON.parse(jsonResult.stdout) as {
                team?: unknown;
            };

            expect(jsonResult.exitCode).toBe(0);
            expect(payload.team).toBeUndefined();
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

// Answers every request `auth status` can make: the API key check and the
// team lookup in either direction. Recording every request is what lets a test
// assert the command's request count, which is part of its documented
// contract.
function createAuthStatusFetcher(
    requests: Request[],
    options: { teamHttpStatus?: number } = {},
): Fetcher {
    return async (input, init) => {
        const request = toRequest(input, init);
        requests.push(request);
        const pathname = new URL(request.url).pathname;

        if (pathname === "/v1/me/teams") {
            return new Response(JSON.stringify({
                teams: [
                    {
                        id: "team-7",
                        name: "acme",
                        role: "member",
                        system_created: false,
                    },
                ],
            }));
        }

        if (!pathname.startsWith("/v1/teams/")) {
            return new Response(null, { status: 200 });
        }

        const teamHttpStatus = options.teamHttpStatus ?? 200;

        return new Response(
            teamHttpStatus === 200
                ? JSON.stringify({
                        id: "team-42",
                        name: "platform",
                        role: "member",
                        system_created: false,
                    })
                : "{}",
            { status: teamHttpStatus },
        );
    };
}

function parseAuthStatusTeam(stdout: string): unknown {
    return (JSON.parse(stdout) as { team?: unknown }).team;
}
