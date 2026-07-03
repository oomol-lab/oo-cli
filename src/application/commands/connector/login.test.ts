import type { CliSandbox } from "../../../../__tests__/helpers.ts";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    toRequest,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../telemetry/outbox.ts";

describe("connector login CLI", () => {
    test("saves the configuration when the token is verified by the server", async () => {
        const sandbox = await createCliSandbox();

        try {
            const requests: Request[] = [];
            const result = await sandbox.run(
                ["connector", "login", "http://localhost:3000", "--token", "oct_test"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        // The Bearer request succeeds; the header-less probe is
                        // rejected, which proves the server enforces the token.
                        if (request.headers.get("Authorization") === "Bearer oct_test") {
                            return createConnectorHealthResponse();
                        }

                        return new Response("", { status: 401 });
                    },
                },
            );
            const fileContent = await readFile(connectorFilePath(sandbox), "utf8");
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(
                "Connected to the self-hosted connector at http://localhost:3000",
            );
            expect(result.stdout).toContain("The token was accepted by the server.");
            expect(fileContent).toBe([
                "[self_hosted]",
                "url = \"http://localhost:3000\"",
                "token = \"oct_test\"",
                "",
            ].join("\n"));
            expect(requests).toHaveLength(2);
            expect(requests[0]?.url).toBe("http://localhost:3000/v1/health");
            expect(requests[0]?.headers.get("Authorization")).toBe("Bearer oct_test");
            expect(requests[1]?.url).toBe("http://localhost:3000/v1/health");
            expect(requests[1]?.headers.get("Authorization")).toBeNull();
            expect(telemetryPayload).toMatchObject({
                properties: {
                    auth_mode: "token",
                    command_full: "connector.login",
                },
            });
            expect(JSON.stringify(telemetryPayload?.properties)).not.toContain("oct_test");
            expect(JSON.stringify(telemetryPayload?.properties)).not.toContain("localhost");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("warns when the server also accepts unauthenticated requests", async () => {
        const sandbox = await createCliSandbox();

        try {
            const requests: Request[] = [];
            const result = await sandbox.run(
                ["connector", "login", "http://localhost:3000", "--token", "oct_test"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return createConnectorHealthResponse();
                    },
                },
            );
            const fileContent = await readFile(connectorFilePath(sandbox), "utf8");

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(
                "Connected to the self-hosted connector at http://localhost:3000",
            );
            expect(result.stdout).toContain("the token could not be verified");
            expect(fileContent).toContain("url = \"http://localhost:3000\"");
            expect(fileContent).toContain("token = \"oct_test\"");
            expect(requests).toHaveLength(2);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("saves a tokenless configuration and prints the access hint", async () => {
        const sandbox = await createCliSandbox();

        try {
            const requests: Request[] = [];
            const result = await sandbox.run(
                ["connector", "login", "http://localhost:3000"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return createConnectorHealthResponse();
                    },
                },
            );
            const fileContent = await readFile(connectorFilePath(sandbox), "utf8");
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("http://localhost:3000/access");
            expect(fileContent).toContain("url = \"http://localhost:3000\"");
            expect(fileContent).not.toContain("token");
            expect(requests).toHaveLength(1);
            expect(requests[0]?.headers.get("Authorization")).toBeNull();
            expect(telemetryPayload).toMatchObject({
                properties: {
                    auth_mode: "open",
                    command_full: "connector.login",
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects a 401 response with the runtime token hint without saving", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["connector", "login", "http://localhost:3000", "--token", "oct_test"],
                {
                    fetcher: async () => new Response("", { status: 401 }),
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "Create a runtime token at http://localhost:3000/access",
            );
            expect(await Bun.file(connectorFilePath(sandbox)).exists()).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("surfaces unexpected HTTP statuses without saving", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["connector", "login", "http://localhost:3000"],
                {
                    fetcher: async () => new Response("", { status: 500 }),
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain("returned HTTP 500");
            expect(await Bun.file(connectorFilePath(sandbox)).exists()).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects responses that are not connector health responses", async () => {
        const sandbox = await createCliSandbox();

        try {
            const bodies = [
                JSON.stringify({ hello: "world" }),
                "not json at all",
            ];

            for (const body of bodies) {
                const result = await sandbox.run(
                    ["connector", "login", "http://localhost:3000"],
                    {
                        fetcher: async () => new Response(body),
                    },
                );

                expect(result.exitCode).toBe(1);
                expect(result.stdout).toBe("");
                expect(result.stderr).toContain(
                    "did not return a connector health response",
                );
            }

            expect(await Bun.file(connectorFilePath(sandbox)).exists()).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("reports an unreachable server without saving", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["connector", "login", "http://localhost:3000"],
                {
                    fetcher: async () => {
                        throw new Error("connect ECONNREFUSED 127.0.0.1:3000");
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "Could not reach the connector server at http://localhost:3000",
            );
            expect(await Bun.file(connectorFilePath(sandbox)).exists()).toBe(false);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects invalid connector URLs before any request", async () => {
        const sandbox = await createCliSandbox();

        try {
            const invalidUrls = [
                "localhost:3000",
                "http://localhost:3000?debug=1",
            ];

            for (const url of invalidUrls) {
                let requestCount = 0;
                const result = await sandbox.run(
                    ["connector", "login", url],
                    {
                        fetcher: async () => {
                            requestCount += 1;

                            return createConnectorHealthResponse();
                        },
                    },
                );

                expect(result.exitCode).toBe(2);
                expect(result.stdout).toBe("");
                expect(result.stderr).toContain("is not a valid http(s) URL");
                expect(requestCount).toBe(0);
            }
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects tokens containing whitespace before any request", async () => {
        const sandbox = await createCliSandbox();

        try {
            let requestCount = 0;
            const result = await sandbox.run(
                ["connector", "login", "http://localhost:3000", "--token", "oct te st"],
                {
                    fetcher: async () => {
                        requestCount += 1;

                        return createConnectorHealthResponse();
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "The connector token must not be empty or contain whitespace",
            );
            expect(requestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("normalizes trailing slashes and keeps path prefixes in the health URL", async () => {
        const sandbox = await createCliSandbox();

        try {
            const trailingSlashRequests: Request[] = [];
            const trailingSlashResult = await sandbox.run(
                ["connector", "login", "http://localhost:3000/"],
                {
                    fetcher: async (input, init) => {
                        trailingSlashRequests.push(toRequest(input, init));

                        return createConnectorHealthResponse();
                    },
                },
            );
            const trailingSlashFileContent = await readFile(
                connectorFilePath(sandbox),
                "utf8",
            );

            const pathPrefixRequests: Request[] = [];
            const pathPrefixResult = await sandbox.run(
                ["connector", "login", "http://gateway.internal:3000/connect"],
                {
                    fetcher: async (input, init) => {
                        pathPrefixRequests.push(toRequest(input, init));

                        return createConnectorHealthResponse();
                    },
                },
            );
            const pathPrefixFileContent = await readFile(
                connectorFilePath(sandbox),
                "utf8",
            );

            expect(trailingSlashResult.exitCode).toBe(0);
            expect(trailingSlashRequests[0]?.url).toBe("http://localhost:3000/v1/health");
            expect(trailingSlashFileContent).toContain("url = \"http://localhost:3000\"");
            expect(trailingSlashFileContent).not.toContain("localhost:3000/");
            expect(pathPrefixResult.exitCode).toBe(0);
            expect(pathPrefixRequests[0]?.url).toBe(
                "http://gateway.internal:3000/connect/v1/health",
            );
            expect(pathPrefixFileContent).toContain(
                "url = \"http://gateway.internal:3000/connect\"",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("notes the OOMOL account requirement only when no account is logged in", async () => {
        const sandbox = await createCliSandbox();

        try {
            const anonymousResult = await sandbox.run(
                ["connector", "login", "http://localhost:3000"],
                {
                    fetcher: async () => createConnectorHealthResponse(),
                },
            );

            await writeAuthFile(sandbox);

            const loggedInResult = await sandbox.run(
                ["connector", "login", "http://localhost:3000"],
                {
                    fetcher: async () => createConnectorHealthResponse(),
                },
            );

            expect(anonymousResult.exitCode).toBe(0);
            expect(anonymousResult.stdout).toContain(
                "Other features still require an OOMOL account",
            );
            expect(loggedInResult.exitCode).toBe(0);
            expect(loggedInResult.stdout).not.toContain("OOMOL account");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

function createConnectorHealthResponse(): Response {
    return new Response(JSON.stringify({
        data: {
            ok: true,
            runtime: "oomol-connect",
        },
        message: "OK",
        meta: {},
        success: true,
    }));
}

function connectorFilePath(sandbox: CliSandbox): string {
    return join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "connector.toml");
}
