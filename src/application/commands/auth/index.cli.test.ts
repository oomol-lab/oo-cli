import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
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

            expect(createAuthLoginSnapshot(result)).toMatchSnapshot();
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
            expect(firstLoginUrl).toStartWith(
                readAuthLoginUrlPrefix(defaultAuthEndpoint),
            );
            expect(secondLogin.exitCode).toBe(0);
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

    test("supports auth login with a custom OOMOL_ENDPOINT", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OOMOL_ENDPOINT = "staging.oomol.test";

        try {
            const result = await runPrintedAuthLogin(sandbox, "secret-1", {
                accountEndpoint: sandbox.env.OOMOL_ENDPOINT,
            });
            const loginUrl = findLoginUrl(result.stdout);

            expect(result.exitCode).toBe(0);
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
            expect(loginUrl).toStartWith(
                readAuthLoginUrlPrefix(defaultAuthEndpoint),
            );
            expect(createAuthLoginSnapshot(result)).toMatchSnapshot();
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
            expect(createAuthLoginSnapshot(login, {
                stripAnsi: true,
            })).toMatchSnapshot();
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
