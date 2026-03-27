import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    defaultAuthEndpoint,
    findLoginUrl,
    readAuthLoginUrlPrefix,
    readLatestLogContent,
    runPrintedAuthLogin,
    toRequest,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { createTerminalColors } from "../../terminal-colors.ts";

const loginUrlColor = "#c09ff5";

describe("auth CLI", () => {
    test("writes auth login callback logs without persisting api keys", async () => {
        const sandbox = await createCliSandbox();
        const encodedApiKey = Buffer.from("secret-1", "utf8").toString("base64");

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1");
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(content).toContain(
                `"msg":"Auth login callback server is listening."`,
            );
            expect(content).toContain(`"msg":"Auth login callback received."`);
            expect(content).toContain(
                `"msg":"Auth login callback completed successfully."`,
            );
            expect(content).toContain(
                `"msg":"Auth account persisted after browser login."`,
            );
            expect(content).toContain(`"hasApiKey":true`);
            expect(content).not.toContain("secret-1");
            expect(content).not.toContain(encodedApiKey);
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

            expect(result.exitCode).toBe(0);
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
});
