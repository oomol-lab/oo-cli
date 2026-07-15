import type { AppSettings } from "../../schemas/settings.ts";
import type {
    ConnectorActionDefinition,
    ConnectorActionMetadata,
} from "./shared.ts";

import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createCliSandbox,
    createCliSnapshot,
    createConnectorActionFixture,
    readLatestLogContent,
    toRequest,
    writeAuthFile,
    writeConnectorFile,
} from "../../../../__tests__/helpers.ts";
import { SqliteCacheStore } from "../../../adapters/cache/sqlite-cache.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../telemetry/outbox.ts";
import { createTerminalColors } from "../../terminal-colors.ts";
import { cacheConnectorActionSchemas } from "./schema-cache.ts";
import {
    connectorSearchActionColor,
    connectorSearchServiceColor,
} from "./search-provider.ts";

describe("connectorCommand CLI", () => {
    test("supports connector search with text output without caching schema-less results", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["connector", "search", "send mail"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        return createConnectorSearchResponse([
                            {
                                authenticated: true,
                                description: "Send a Gmail message.",
                                name: "send_mail",
                                service: "gmail",
                            },
                        ]);
                    },
                },
            );
            const schemaResult = await sandbox.run(
                ["connector", "schema", "gmail", "--action", "send_mail"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        return new Response(JSON.stringify({
                            data: {
                                description: "Fresh Send a Gmail message.",
                                inputSchema: {
                                    properties: {
                                        to: {
                                            type: "string",
                                        },
                                    },
                                    required: ["to"],
                                    type: "object",
                                },
                                name: "send_mail",
                                outputSchema: {
                                    type: "object",
                                },
                                providerPermissions: [],
                                requiredScopes: [],
                                service: "gmail",
                            },
                        }));
                    },
                },
            );

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("gmail.send_mail");
            expect(result.stdout).toContain("Send a Gmail message.");
            expect(result.stdout).toContain("Authenticated: yes");
            expect(result.stdout).not.toContain("Schema path");
            expect(JSON.parse(schemaResult.stdout)).toEqual({
                description: "Fresh Send a Gmail message.",
                inputSchema: {
                    properties: {
                        to: {
                            type: "string",
                        },
                    },
                    required: ["to"],
                    type: "object",
                },
                name: "send_mail",
                outputSchema: {
                    type: "object",
                },
                service: "gmail",
            });
            expect(requests).toHaveLength(2);
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/actions/search?q=send+mail",
            );
            expect(requests[1]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("warms the schema cache from search results so connector schema needs no fresh request", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const searchResult = await sandbox.run(
                ["connector", "search", "send mail"],
                {
                    fetcher: async () => createConnectorSearchResponse([
                        {
                            authenticated: true,
                            description: "Send a Gmail message.",
                            inputSchema: {
                                properties: {
                                    to: {
                                        type: "string",
                                    },
                                },
                                required: ["to"],
                                type: "object",
                            },
                            name: "send_mail",
                            outputSchema: {
                                type: "object",
                            },
                            service: "gmail",
                        },
                    ]),
                },
            );

            const schemaRequests: Request[] = [];
            const schemaResult = await sandbox.run(
                ["connector", "schema", "gmail", "--action", "send_mail"],
                {
                    fetcher: async (input, init) => {
                        schemaRequests.push(toRequest(input, init));

                        return new Response("unexpected", {
                            status: 500,
                        });
                    },
                },
            );

            expect(searchResult.exitCode).toBe(0);
            expect(searchResult.stdout).toContain("gmail.send_mail");
            expect(schemaResult.exitCode).toBe(0);
            expect(schemaRequests).toHaveLength(0);
            expect(JSON.parse(schemaResult.stdout)).toEqual({
                description: "Send a Gmail message.",
                inputSchema: {
                    properties: {
                        to: {
                            type: "string",
                        },
                    },
                    required: ["to"],
                    type: "object",
                },
                name: "send_mail",
                outputSchema: {
                    type: "object",
                },
                service: "gmail",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("loads full async submit lifecycle metadata after connector search and returns the handle", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            await sandbox.run(
                ["connector", "search", "generate image"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/v1/actions/search")) {
                            return createConnectorSearchResponse([
                                {
                                    authenticated: false,
                                    description: "Submit OpenAI image generation.",
                                    name: "openai_image_async_submit",
                                    service: "fusion-api",
                                },
                            ]);
                        }

                        return new Response(JSON.stringify({
                            data: ["fusion-api"],
                        }));
                    },
                },
            );

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_submit",
                    "-d",
                    "{}",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (
                            request.method === "GET"
                            && request.url === "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_submit"
                        ) {
                            return new Response(JSON.stringify({
                                data: {
                                    asyncLifecycle: {
                                        role: "submit",
                                        resultAction: "openai_image_async_result",
                                        handle: {
                                            inputField: "sessionID",
                                            outputField: "sessionId",
                                        },
                                    },
                                    description: "Submit OpenAI image generation.",
                                    inputSchema: {
                                        type: "object",
                                    },
                                    name: "openai_image_async_submit",
                                    outputSchema: {
                                        properties: {
                                            sessionId: {
                                                type: "string",
                                            },
                                        },
                                        required: ["sessionId"],
                                        type: "object",
                                    },
                                    providerPermissions: [],
                                    requiredScopes: [],
                                    service: "fusion-api",
                                },
                            }));
                        }

                        if (request.url.endsWith("openai_image_async_submit")) {
                            return new Response(JSON.stringify({
                                data: {
                                    sessionId: "session-1",
                                },
                                meta: {
                                    executionId: "submit-exec",
                                },
                            }));
                        }

                        return new Response(JSON.stringify({
                            data: {
                                data: {
                                    images: ["image-1"],
                                },
                                state: "completed",
                            },
                            meta: {
                                executionId: "poll-exec",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(JSON.parse(result.stdout)).toEqual({
                data: {
                    sessionId: "session-1",
                },
                meta: {
                    executionId: "submit-exec",
                },
            });
            expect(requests.map(request => request.url)).toEqual([
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_submit",
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_submit",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports connector search with json output and omits schemas", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["connector", "search", "send mail", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/v1/actions/search")) {
                            return createConnectorSearchResponse([
                                {
                                    authenticated: false,
                                    description: "Send a Gmail message.",
                                    inputSchema: {
                                        type: "object",
                                    },
                                    name: "send_mail",
                                    outputSchema: {
                                        type: "object",
                                    },
                                    service: "gmail",
                                },
                            ]);
                        }

                        return new Response(JSON.stringify({
                            data: [],
                        }));
                    },
                },
            );

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
            expect(JSON.parse(result.stdout)).toEqual([
                {
                    authenticated: false,
                    description: "Send a Gmail message.",
                    name: "send_mail",
                    service: "gmail",
                },
            ]);
            expect(result.stdout).not.toContain("inputSchema");
            expect(result.stdout).not.toContain("outputSchema");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders connector search output with field-specific colors", async () => {
        const sandbox = await createCliSandbox();
        const colors = createTerminalColors(true);

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["connector", "search", "send mail"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        if (request.url.includes("/v1/actions/search")) {
                            return createConnectorSearchResponse([
                                {
                                    authenticated: true,
                                    description: "Send a Gmail message.",
                                    name: "send_mail",
                                    service: "gmail",
                                },
                            ]);
                        }

                        return new Response(JSON.stringify({
                            data: ["gmail"],
                        }));
                    },
                    stdout: {
                        hasColors: true,
                    },
                },
            );

            expect(createCliSnapshot(result, {
                sandbox,
                stripAnsi: true,
            })).toMatchSnapshot();
            expect(result.stdout).toContain(
                `${colors.hex(connectorSearchServiceColor)("gmail")}.${colors.hex(connectorSearchActionColor)("send_mail")}`,
            );
            expect(result.stdout).toContain(`Authenticated: ${colors.green("yes")}`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("validates the connector search format option", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run([
                "connector",
                "search",
                "send mail",
                "--format=yaml",
            ]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders connector search help when text argument is omitted", async () => {
        const sandbox = await createCliSandbox();

        try {
            const expectedHelp = await sandbox.run(["connector", "search", "--help"]);
            const result = await sandbox.run(["connector", "search"]);

            expect({
                expectedHelp: createCliSnapshot(expectedHelp),
                result: createCliSnapshot(result),
            }).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders connector schema help with the json compatibility option", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["connector", "schema", "--help"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(result.stdout).not.toContain("--format");
            expect(result.stdout).toContain("--json");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders connector schema refresh help", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["connector", "schema", "refresh", "--help"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders connector run help with the wait and identity options", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["connector", "run", "--help"]);
            // Help descriptions wrap across lines, so compare against a
            // whitespace-collapsed copy to stay independent of column widths.
            const help = collapseWhitespace(result.stdout);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("--wait");
            expect(help).toContain(
                "Poll until an async result action reaches a terminal state",
            );
            expect(result.stdout).toContain("--wait-result");
            expect(help).toContain(
                "Submit an async action and wait for its result action",
            );
            expect(result.stdout).toContain("--team");
            expect(result.stdout).toContain("--personal");
            expect(result.stdout).toContain("--connection-name");
            expect(help).toContain(
                "Run the action under the given team identity",
            );
            expect(help).toContain(
                "Run the action with the connector app connection name",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders connector proxy help with request and identity options", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["connector", "proxy", "--help"]);
            const help = collapseWhitespace(result.stdout);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("--endpoint");
            expect(result.stdout).toContain("--method");
            expect(result.stdout).toContain("--query");
            expect(result.stdout).toContain("--headers");
            expect(result.stdout).toContain("--body");
            expect(result.stdout).toContain("--team");
            expect(result.stdout).toContain("--personal");
            expect(help).toContain(
                "Proxy a provider API request through a connected connector app",
            );
            expect(help).toContain("Run the proxy request under");
            expect(help).not.toContain("Run the action under");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports connector proxy with split request options and team identity", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "proxy",
                    "tavily",
                    "--endpoint",
                    "/search",
                    "--method",
                    "POST",
                    "--query",
                    "{\"limit\":1}",
                    "--headers",
                    "{\"accept\":\"application/json\"}",
                    "--body",
                    "{\"query\":\"hello\"}",
                    "--team",
                    "acme",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: {
                                data: {
                                    answer: "world",
                                },
                                headers: {
                                    "content-type": "application/json",
                                },
                                status: 200,
                            },
                            meta: {
                                executionId: "exec-1",
                                service: "tavily",
                            },
                        }));
                    },
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(JSON.parse(result.stdout)).toEqual({
                data: {
                    data: {
                        answer: "world",
                    },
                    headers: {
                        "content-type": "application/json",
                    },
                    status: 200,
                },
                meta: {
                    executionId: "exec-1",
                    service: "tavily",
                },
            });
            expect(requests).toHaveLength(1);
            expect(requests[0]?.method).toBe("POST");
            expect(requests[0]?.url).toBe("https://connector.oomol.com/v1/proxy/tavily");
            expect(requests[0]?.headers.get("x-oo-team-name")).toBe("acme");
            await expect(requests[0]?.json()).resolves.toEqual({
                body: {
                    query: "hello",
                },
                endpoint: "/search",
                headers: {
                    accept: "application/json",
                },
                method: "POST",
                query: {
                    limit: 1,
                },
            });
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "connector.proxy",
                    data_size_bucket: "<1KB",
                    has_body: true,
                    identity_source: "flag",
                    method: "POST",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("body");
            expect(telemetryPayload?.properties).not.toHaveProperty("endpoint");
            expect(telemetryPayload?.properties).not.toHaveProperty("headers");
            expect(telemetryPayload?.properties).not.toHaveProperty("team");
            expect(telemetryPayload?.properties).not.toHaveProperty("service");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports connector proxy with data file input and text output", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await Bun.write(
                join(sandbox.cwd, "proxy-request.json"),
                JSON.stringify({
                    endpoint: "/empty",
                    method: "GET",
                }),
            );

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "proxy",
                    "tavily",
                    "--data",
                    "@proxy-request.json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: {
                                status: 204,
                            },
                            meta: {
                                executionId: "exec-1",
                                service: "tavily",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("Status: 204");
            expect(result.stdout).toContain("Execution ID: exec-1");
            expect(result.stdout).toContain("Result data:");
            expect(result.stdout).toContain("null");
            expect(requests).toHaveLength(1);
            await expect(requests[0]?.json()).resolves.toEqual({
                endpoint: "/empty",
                method: "GET",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("normalizes connector proxy method values case-insensitively", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "proxy",
                    "tavily",
                    "--endpoint",
                    "/search",
                    "--method",
                    "get",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: {
                                data: null,
                                headers: {},
                                status: 200,
                            },
                            meta: {
                                executionId: "exec-1",
                                service: "tavily",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(requests).toHaveLength(1);
            await expect(requests[0]?.json()).resolves.toEqual({
                endpoint: "/search",
                method: "GET",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects invalid connector proxy method values before login", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run([
                "connector",
                "proxy",
                "tavily",
                "--endpoint",
                "/search",
                "--method",
                "TRACE",
            ]);

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "The connector proxy request payload is invalid:",
            );
            expect(result.stderr).toContain("method:");
            expect(result.stderr).toContain("expected one of");
            expect(result.stderr).not.toContain("You must log in");
            expect(result.stderr).not.toContain("Invalid format");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects connector proxy request usage errors before login", async () => {
        const sandbox = await createCliSandbox();

        try {
            const cases = [
                {
                    argv: ["connector", "proxy", "tavily"],
                    message: "The --endpoint option is required when --data is omitted.",
                },
                {
                    argv: ["connector", "proxy", "tavily", "--endpoint", "/search"],
                    message: "The --method option is required when --data is omitted.",
                },
                {
                    argv: [
                        "connector",
                        "proxy",
                        "tavily",
                        "--data",
                        "{}",
                        "--endpoint",
                        "/search",
                        "--method",
                        "GET",
                    ],
                    message:
                        "Use either --data or the split proxy request options, not both.",
                },
                {
                    argv: [
                        "connector",
                        "proxy",
                        "tavily",
                        "--endpoint",
                        "/search",
                        "--method",
                        "GET",
                        "--query",
                        "{",
                    ],
                    message: "The --query value is not valid JSON:",
                },
                {
                    argv: [
                        "connector",
                        "proxy",
                        "tavily",
                        "--endpoint",
                        "/search",
                        "--method",
                        "GET",
                        "--headers",
                        "{",
                    ],
                    message: "The --headers value is not valid JSON:",
                },
                {
                    argv: [
                        "connector",
                        "proxy",
                        "tavily",
                        "--endpoint",
                        "/search",
                        "--method",
                        "GET",
                        "--body",
                        "{",
                    ],
                    message: "The --body value is not valid JSON:",
                },
                {
                    argv: ["connector", "proxy", "tavily", "--data", "{"],
                    message: "The --data value is not valid JSON:",
                },
                {
                    argv: ["connector", "proxy", "tavily", "--data", "@"],
                    message: "The @data file path cannot be empty.",
                },
                {
                    argv: ["connector", "proxy", "tavily", "--data", "@missing.json"],
                    exitCode: 1,
                    message: "Failed to read proxy request data from",
                },
                {
                    argv: ["connector", "proxy", "tavily", "--data", ""],
                    message: "endpoint:",
                },
            ];

            for (const testCase of cases) {
                const result = await sandbox.run(testCase.argv);

                expect(result.exitCode).toBe(testCase.exitCode ?? 2);
                expect(result.stdout).toBe("");
                expect(result.stderr).toContain(testCase.message);
                expect(result.stderr).not.toContain("You must log in");
            }
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records connector proxy failure telemetry without raw request values", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                [
                    "connector",
                    "proxy",
                    "tavily",
                    "--endpoint",
                    "/search",
                    "--method",
                    "GET",
                    "--json",
                ],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        errorCode: "invalid_input",
                        message: "bad query",
                        success: false,
                    }), {
                        status: 400,
                    }),
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain(
                "Connector proxy service tavily returned HTTP 400",
            );
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "connector.proxy",
                    data_size_bucket: "<1KB",
                    error_code: "invalid_input",
                    has_body: false,
                    http_status: 400,
                    identity_source: "personal",
                    method: "GET",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("endpoint");
            expect(telemetryPayload?.properties).not.toHaveProperty("service");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists connector apps for one service as json without app ids", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["connector", "apps", "gmail", "--json"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: [
                            {
                                accountLabel: "user@example.com",
                                alias: "work",
                                aliasNormalized: "work",
                                authType: "oauth2",
                                createdAt: 1,
                                displayName: "Work Gmail",
                                id: "app-1",
                                isDefault: true,
                                providerAccountId: "acct-1",
                                scopes: ["gmail.send"],
                                service: "gmail",
                                status: "active",
                                updatedAt: 2,
                                userId: "user-1",
                            },
                        ],
                    })),
                },
            );

            expect(result.exitCode).toBe(0);
            const output = JSON.parse(result.stdout);

            expect(output).toEqual([
                {
                    accountLabel: "user@example.com",
                    authType: "oauth2",
                    connectionName: "work",
                    displayName: "Work Gmail",
                    isDefault: true,
                    scopes: ["gmail.send"],
                    service: "gmail",
                    status: "active",
                },
            ]);
            expect(JSON.stringify(output)).not.toContain("app-1");
            expect(JSON.stringify(output)).not.toContain("acct-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists connector apps as text with connection names and default status", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["connector", "apps", "gmail"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: [
                            {
                                accountLabel: "user@example.com",
                                alias: "work",
                                authType: "oauth2",
                                displayName: "Work Gmail",
                                isDefault: true,
                                scopes: ["gmail.send"],
                                service: "gmail",
                                status: "active",
                            },
                        ],
                    })),
                },
            );

            expect(result.exitCode).toBe(0);
            // The by-service listing omits the Service column.
            expect(result.stdout).not.toContain("Service");
            expect(result.stdout).toContain("Connection Name");
            expect(result.stdout).toContain("Default");
            expect(result.stdout).toContain("work");
            expect(result.stdout).toContain("Work Gmail");
            expect(result.stdout).toContain("active");
            expect(result.stdout).toContain("oauth2");
            // A default connection renders a check marker instead of a word.
            expect(result.stdout).toContain("✓");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders empty connector apps output", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const textResult = await sandbox.run(
                ["connector", "apps", "gmail"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: [],
                    })),
                },
            );
            const jsonResult = await sandbox.run(
                ["connector", "apps", "gmail", "--json"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: [],
                    })),
                },
            );

            expect(textResult.exitCode).toBe(0);
            expect(textResult.stdout).toContain(
                "No connector apps were found for this service.",
            );
            expect(JSON.parse(jsonResult.stdout)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders missing connector app connection names as null in json and dash in text", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const appResponse = JSON.stringify({
                data: [
                    {
                        accountLabel: "user@example.com",
                        authType: null,
                        displayName: "Personal Gmail",
                        isDefault: false,
                        scopes: [],
                        service: "gmail",
                        status: "active",
                    },
                ],
            });
            const jsonResult = await sandbox.run(
                ["connector", "apps", "gmail", "--json"],
                {
                    fetcher: async () => new Response(appResponse),
                },
            );
            const textResult = await sandbox.run(
                ["connector", "apps", "gmail"],
                {
                    fetcher: async () => new Response(appResponse),
                },
            );

            expect(JSON.parse(jsonResult.stdout)[0]).toMatchObject({
                connectionName: null,
            });
            expect(textResult.stdout).toContain("Personal Gmail");
            expect(textResult.stdout).toContain("active");
            // Missing connection name / auth render as a dash; a non-default app
            // does not get the check marker.
            expect(textResult.stdout).toContain("-");
            expect(textResult.stdout).not.toContain("✓");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("surfaces connector apps request and response failures", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const failedResult = await sandbox.run(
                ["connector", "apps", "gmail"],
                {
                    fetcher: async () => new Response("", {
                        status: 503,
                    }),
                },
            );
            const invalidResult = await sandbox.run(
                ["connector", "apps", "gmail"],
                {
                    fetcher: async () => new Response(JSON.stringify({})),
                },
            );

            expect(failedResult.exitCode).toBe(1);
            expect(failedResult.stderr).toContain(
                "The connector apps request returned HTTP 503.",
            );
            expect(invalidResult.exitCode).toBe(1);
            expect(invalidResult.stderr).toContain(
                "The connector apps response body is unsupported.",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records connector apps telemetry without raw app fields", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["connector", "apps", "gmail", "--json"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: [
                            {
                                accountLabel: "user@example.com",
                                alias: "work",
                                authType: "oauth2",
                                displayName: "Work Gmail",
                                id: "app-1",
                                isDefault: true,
                                providerAccountId: "acct-1",
                                scopes: ["gmail.send"],
                                service: "gmail",
                                status: "active",
                            },
                        ],
                    })),
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(0);
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "connector.apps",
                    result_count_bucket: "1-5",
                },
            });
            expect(JSON.stringify(telemetryPayload?.properties)).not.toContain("app-1");
            expect(JSON.stringify(telemetryPayload?.properties)).not.toContain("acct-1");
            expect(JSON.stringify(telemetryPayload?.properties)).not.toContain("work");
            expect(JSON.stringify(telemetryPayload?.properties)).not.toContain(
                "user@example.com",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records connector apps failure telemetry without raw service or error values", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["connector", "apps", "gmail"],
                {
                    fetcher: async () => new Response("private error body", {
                        status: 503,
                    }),
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(1);
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "connector.apps",
                },
            });
            expect(JSON.stringify(telemetryPayload?.properties)).not.toContain("gmail");
            expect(JSON.stringify(telemetryPayload?.properties)).not.toContain(
                "private error body",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders connector apps help as a read-only listing command", async () => {
        const sandbox = await createCliSandbox();

        try {
            const connectorHelp = await sandbox.run(["connector", "--help"]);
            const appsHelp = await sandbox.run(["connector", "apps", "--help"]);

            expect(connectorHelp.stdout).toContain("apps");
            expect(appsHelp.exitCode).toBe(0);
            expect(appsHelp.stdout).toContain("--json");
            expect(appsHelp.stdout).toContain("--team");
            expect(appsHelp.stdout).toContain("--personal");
            expect(appsHelp.stdout).toContain("List connected connector apps");
            expect(appsHelp.stdout).not.toContain("disconnect");
            expect(appsHelp.stdout).not.toContain("reconnect");
            expect(appsHelp.stdout).not.toContain("update alias");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists every connected connector app as json without a service argument", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["connector", "apps", "--json"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: [
                                {
                                    accountLabel: "user@example.com",
                                    alias: "work",
                                    authType: "oauth2",
                                    displayName: "Work Gmail",
                                    id: "app-1",
                                    isDefault: true,
                                    providerAccountId: "acct-1",
                                    scopes: ["gmail.send"],
                                    service: "gmail",
                                    status: "active",
                                },
                                {
                                    accountLabel: "team",
                                    alias: null,
                                    authType: "oauth2",
                                    displayName: "Linear",
                                    id: "app-2",
                                    isDefault: true,
                                    providerAccountId: "acct-2",
                                    scopes: [],
                                    service: "linear",
                                    status: "active",
                                },
                            ],
                        }));
                    },
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(requests[0]?.method).toBe("GET");
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/apps?status=active",
            );
            expect(requests[0]?.headers.get("x-oo-team-name")).toBeNull();
            expect(JSON.parse(result.stdout)).toEqual([
                {
                    accountLabel: "user@example.com",
                    authType: "oauth2",
                    connectionName: "work",
                    displayName: "Work Gmail",
                    isDefault: true,
                    scopes: ["gmail.send"],
                    service: "gmail",
                    status: "active",
                },
                {
                    accountLabel: "team",
                    authType: "oauth2",
                    connectionName: null,
                    displayName: "Linear",
                    isDefault: true,
                    scopes: [],
                    service: "linear",
                    status: "active",
                },
            ]);
            expect(JSON.stringify(JSON.parse(result.stdout))).not.toContain("app-1");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "connector.apps",
                    identity_source: "personal",
                    list_scope: "all",
                    result_count_bucket: "1-5",
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists every connected connector app as text with a service column", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["connector", "apps"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: [
                            {
                                accountLabel: "user@example.com",
                                alias: "work",
                                authType: "oauth2",
                                displayName: "Work Gmail",
                                isDefault: true,
                                scopes: ["gmail.send"],
                                service: "gmail",
                                status: "active",
                            },
                            {
                                accountLabel: "team",
                                alias: null,
                                authType: "oauth2",
                                displayName: "Linear",
                                isDefault: true,
                                scopes: [],
                                service: "x",
                                status: "active",
                            },
                        ],
                    })),
                },
            );
            const lines = result.stdout.trimEnd().split("\n");

            expect(result.exitCode).toBe(0);
            // Header leads with the Service column across providers.
            expect(lines[0]).toContain("Service");
            expect(lines[0]).toContain("Connection Name");
            expect(lines[0]).toContain("Default");
            expect(result.stdout).toContain("gmail");
            expect(result.stdout).toContain("Work Gmail");
            expect(result.stdout).toContain("Linear");
            expect(result.stdout).toContain("✓");
            // Columns are padded to a common width, so the "Name" column starts
            // at the same offset regardless of service-name length.
            expect(lines[1]!.indexOf("Work Gmail")).toBe(lines[2]!.indexOf("Linear"));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists every connected connector app under a team identity", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["connector", "apps", "--team", "acme", "--json"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({ data: [] }));
                    },
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/apps?status=active",
            );
            expect(requests[0]?.headers.get("x-oo-team-name")).toBe("acme");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "connector.apps",
                    identity_source: "flag",
                    list_scope: "all",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("team");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists every connected connector app under the configured default team", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await sandbox.run(["config", "set", "identity.team", "acme"]);

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["connector", "apps", "--json"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({ data: [] }));
                    },
                },
            );
            const appsTelemetryPayload = readTelemetryRowsForTest(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
            )
                .map(row => parseTelemetryRowPayload(row))
                .find(payload => payload?.properties?.command_full === "connector.apps");

            expect(result.exitCode).toBe(0);
            expect(requests[0]?.headers.get("x-oo-team-name")).toBe("acme");
            expect(appsTelemetryPayload).toMatchObject({
                properties: {
                    identity_source: "config",
                    list_scope: "all",
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("applies the team identity to the by-service apps listing", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["connector", "apps", "gmail", "--team", "acme", "--json"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({ data: [] }));
                    },
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(0);
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/apps/services/gmail",
            );
            expect(requests[0]?.headers.get("x-oo-team-name")).toBe("acme");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    identity_source: "flag",
                    list_scope: "service",
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects conflicting identity flags when listing apps", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            let requestCount = 0;
            const result = await sandbox.run(
                ["connector", "apps", "--team", "acme", "--personal"],
                {
                    fetcher: async () => {
                        requestCount += 1;

                        return new Response(JSON.stringify({ data: [] }));
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain(
                "Use either --team or --personal, not both.",
            );
            expect(requestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders the no-connections message when no apps are connected", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["connector", "apps"],
                {
                    fetcher: async () => new Response(JSON.stringify({ data: [] })),
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain(
                "No connected connector apps were found.",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("lists every connected app against a self-hosted connector without identity headers", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeConnectorFile(sandbox, {
                url: "http://localhost:3000",
                token: "oct_test",
            });

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["connector", "apps", "--json"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: [
                                {
                                    accountLabel: "default",
                                    alias: "default",
                                    authType: "oauth2",
                                    displayName: "GitHub",
                                    isDefault: true,
                                    scopes: [],
                                    service: "github",
                                    status: "active",
                                },
                            ],
                        }));
                    },
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe("http://localhost:3000/v1/apps?status=active");
            expect(requests[0]?.headers.get("Authorization")).toBe("Bearer oct_test");
            expect(requests[0]?.headers.get("x-oo-team-name")).toBeNull();
            expect(telemetryPayload).toMatchObject({
                properties: {
                    connector_kind: "self_hosted",
                    identity_source: "personal",
                    list_scope: "all",
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects --team for a self-hosted connector when listing apps", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeConnectorFile(sandbox, {
                url: "http://localhost:3000",
                token: "oct_test",
            });

            let requestCount = 0;
            const result = await sandbox.run(
                ["connector", "apps", "--team", "acme", "--json"],
                {
                    fetcher: async () => {
                        requestCount += 1;

                        return new Response(JSON.stringify({ data: [] }));
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain(
                "The --team option is not supported by a self-hosted connector.",
            );
            expect(requestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports connector run with cached schema and json output", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                {
                    description: "Send a Gmail message.",
                    inputSchema: {
                        properties: {
                            to: {
                                format: "email",
                                type: "string",
                            },
                        },
                        required: ["to"],
                        type: "object",
                    },
                    name: "send_mail",
                    outputSchema: {
                        properties: {
                            messageId: {
                                type: "string",
                            },
                        },
                        required: ["messageId"],
                        type: "object",
                    },
                    service: "gmail",
                },
            );

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "--input",
                    "{\"to\":\"foo@bar.com\"}",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: {
                                messageId: "message-1",
                            },
                            meta: {
                                executionId: "exec-1",
                            },
                            message: "ok",
                            success: true,
                        }));
                    },
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(JSON.parse(result.stdout)).toEqual({
                data: {
                    messageId: "message-1",
                },
                meta: {
                    executionId: "exec-1",
                },
            });
            expect(result.stdout).not.toContain("\"success\"");
            expect(result.stdout).not.toContain("\"message\"");
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
            expect(requests[0]?.method).toBe("POST");
            await expect(requests[0]?.json()).resolves.toEqual({
                input: {
                    to: "foo@bar.com",
                },
            });
            expect(telemetryPayload).toMatchObject({
                properties: {
                    action: "send_mail",
                    command_full: "connector.run",
                    connection_selector: "none",
                    data_size_bucket: "<1KB",
                    dry_run: false,
                    identity_source: "personal",
                    service: "gmail",
                    wait: false,
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("data");
            expect(telemetryPayload?.properties).not.toHaveProperty("input");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("runs a connector action with a connection-name selector header", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createConnectorActionFixture());

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "--connection-name",
                    " work ",
                    "-d",
                    "{\"to\":\"foo@bar.com\"}",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: {
                                messageId: "message-1",
                            },
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
            expect(requests[0]?.headers.get("x-oo-connector-alias")).toBe("work");
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "connector.run",
                    connection_selector: "connectionName",
                },
            });
            expect(JSON.stringify(telemetryPayload?.properties)).not.toContain("work");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects an empty --connection-name value before login and schema lookup", async () => {
        const sandbox = await createCliSandbox();

        try {
            let requestCount = 0;
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "--connection-name",
                    "   ",
                    "-d",
                    "{\"to\":\"foo@bar.com\"}",
                    "--json",
                ],
                {
                    fetcher: async () => {
                        requestCount += 1;

                        return new Response(JSON.stringify({
                            data: {},
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain("The --connection-name value cannot be empty.");
            expect(requestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("keeps schema metadata requests connection-name-free", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "--connection-name",
                    "work",
                    "-d",
                    "{\"to\":\"foo@bar.com\"}",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.method === "GET") {
                            return new Response(JSON.stringify({
                                data: {
                                    description: "Send a Gmail message.",
                                    inputSchema: {
                                        properties: {
                                            to: {
                                                type: "string",
                                            },
                                        },
                                        required: ["to"],
                                        type: "object",
                                    },
                                    name: "send_mail",
                                    outputSchema: {
                                        type: "object",
                                    },
                                    providerPermissions: [],
                                    requiredScopes: [],
                                    service: "gmail",
                                },
                            }));
                        }

                        return new Response(JSON.stringify({
                            data: {
                                messageId: "message-1",
                            },
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(2);
            expect(requests[0]?.method).toBe("GET");
            expect(requests[0]?.headers.get("x-oo-connector-alias")).toBeNull();
            expect(requests[1]?.method).toBe("POST");
            expect(requests[1]?.headers.get("x-oo-connector-alias")).toBe("work");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("returns async submit handle without waiting by default", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                createAsyncSubmitActionSchema(),
            );

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_submit",
                    "-d",
                    "{\"prompt\":\"a cat\"}",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: {
                                sessionId: "session-1",
                            },
                            meta: {
                                executionId: "submit-exec",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(JSON.parse(result.stdout)).toEqual({
                data: {
                    sessionId: "session-1",
                },
                meta: {
                    executionId: "submit-exec",
                },
            });
            expect(requests.map(request => request.url)).toEqual([
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_submit",
            ]);
            await expect(requests[0]?.json()).resolves.toEqual({
                input: {
                    prompt: "a cat",
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("waits for async result lifecycle completion when --wait is enabled", async () => {
        const sandbox = await createCliSandbox();
        const sleepMock = createBunSleepMock();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                createAsyncResultActionSchema(),
            );

            const requests: Request[] = [];
            const responses = [
                {
                    data: {
                        state: "processing",
                    },
                    meta: {
                        executionId: "poll-exec-1",
                    },
                },
                {
                    data: {
                        data: {
                            images: ["image-1"],
                        },
                        state: "completed",
                    },
                    meta: {
                        executionId: "poll-exec-2",
                    },
                },
            ];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_result",
                    "-d",
                    "{\"sessionID\":\"session-1\"}",
                    "--wait",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify(responses.shift()));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(JSON.parse(result.stdout)).toEqual({
                data: {
                    images: ["image-1"],
                },
                meta: {
                    executionId: "poll-exec-2",
                    pollAction: "openai_image_async_result",
                    pollCount: 2,
                },
            });
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(telemetryPayload).toMatchObject({
                properties: {
                    action: "openai_image_async_result",
                    command_full: "connector.run",
                    data_size_bucket: "<1KB",
                    dry_run: false,
                    service: "fusion-api",
                    wait: true,
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("sessionID");
            expect(requests.map(request => request.url)).toEqual([
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_result",
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_result",
            ]);
            await expect(requests[0]?.json()).resolves.toEqual({
                input: {
                    sessionID: "session-1",
                },
            });
            await expect(requests[1]?.json()).resolves.toEqual({
                input: {
                    sessionID: "session-1",
                },
            });
            expect(sleepMock.sleepCalls).toEqual([3_000]);
        }
        finally {
            sleepMock.restore();
            await sandbox.cleanup();
        }
    });

    test("sends the connection-name selector on every async wait poll request", async () => {
        const sandbox = await createCliSandbox();
        const sleepMock = createBunSleepMock();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createAsyncResultActionSchema());

            const requests: Request[] = [];
            const responses = [
                {
                    data: {
                        state: "processing",
                    },
                    meta: {
                        executionId: "poll-exec-1",
                    },
                },
                {
                    data: {
                        data: {
                            images: ["image-1"],
                        },
                        state: "completed",
                    },
                    meta: {
                        executionId: "poll-exec-2",
                    },
                },
            ];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_result",
                    "-d",
                    "{\"sessionID\":\"session-1\"}",
                    "--connection-name",
                    "work",
                    "--wait",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify(responses.shift()));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(2);
            expect(requests.map(
                request => request.headers.get("x-oo-connector-alias"),
            )).toEqual(["work", "work"]);
        }
        finally {
            sleepMock.restore();
            await sandbox.cleanup();
        }
    });

    test("submits async actions and waits for result action completion when --wait-result is enabled", async () => {
        const sandbox = await createCliSandbox();
        const sleepMock = createBunSleepMock();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createAsyncSubmitActionSchema());
            await seedConnectorActionSchema(sandbox, createAsyncResultActionSchema());

            const requests: Request[] = [];
            const responses = [
                {
                    data: {
                        sessionId: "session-1",
                    },
                    meta: {
                        executionId: "submit-exec",
                    },
                },
                {
                    data: {
                        state: "processing",
                    },
                    meta: {
                        executionId: "poll-exec-1",
                    },
                },
                {
                    data: {
                        data: {
                            images: ["image-1"],
                        },
                        state: "completed",
                    },
                    meta: {
                        executionId: "poll-exec-2",
                    },
                },
            ];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_submit",
                    "-d",
                    "{\"prompt\":\"a cat\"}",
                    "--wait-result",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify(responses.shift()));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(JSON.parse(result.stdout)).toEqual({
                data: {
                    images: ["image-1"],
                },
                meta: {
                    executionId: "poll-exec-2",
                    handle: "session-1",
                    pollAction: "openai_image_async_result",
                    pollCount: 2,
                    submitExecutionId: "submit-exec",
                },
            });
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(telemetryPayload).toMatchObject({
                properties: {
                    action: "openai_image_async_submit",
                    command_full: "connector.run",
                    data_size_bucket: "<1KB",
                    dry_run: false,
                    service: "fusion-api",
                    wait: false,
                    wait_result: true,
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("prompt");
            expect(requests.map(request => request.url)).toEqual([
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_submit",
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_result",
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_result",
            ]);
            await expect(requests[0]?.json()).resolves.toEqual({
                input: {
                    prompt: "a cat",
                },
            });
            await expect(requests[1]?.json()).resolves.toEqual({
                input: {
                    sessionID: "session-1",
                },
            });
            await expect(requests[2]?.json()).resolves.toEqual({
                input: {
                    sessionID: "session-1",
                },
            });
            expect(sleepMock.sleepCalls).toEqual([3_000]);
        }
        finally {
            sleepMock.restore();
            await sandbox.cleanup();
        }
    });

    test("sends the connection-name selector on async submit and result requests", async () => {
        const sandbox = await createCliSandbox();
        const sleepMock = createBunSleepMock();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createAsyncSubmitActionSchema());
            await seedConnectorActionSchema(sandbox, createAsyncResultActionSchema());

            const requests: Request[] = [];
            const responses = [
                {
                    data: {
                        sessionId: "session-1",
                    },
                    meta: {
                        executionId: "submit-exec",
                    },
                },
                {
                    data: {
                        state: "processing",
                    },
                    meta: {
                        executionId: "poll-exec-1",
                    },
                },
                {
                    data: {
                        data: {
                            images: ["image-1"],
                        },
                        state: "completed",
                    },
                    meta: {
                        executionId: "poll-exec-2",
                    },
                },
            ];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_submit",
                    "-d",
                    "{\"prompt\":\"a cat\"}",
                    "--connection-name",
                    "work",
                    "--wait-result",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify(responses.shift()));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(requests.map(request => request.url)).toEqual([
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_submit",
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_result",
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_result",
            ]);
            expect(requests.map(
                request => request.headers.get("x-oo-connector-alias"),
            )).toEqual(["work", "work", "work"]);
        }
        finally {
            sleepMock.restore();
            await sandbox.cleanup();
        }
    });

    test("preserves the original async submit handle value in wait-result metadata", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createAsyncSubmitActionSchema());
            await seedConnectorActionSchema(sandbox, createAsyncResultActionSchema());

            const requests: Request[] = [];
            const responses = [
                {
                    data: {
                        sessionId: 42,
                    },
                    meta: {
                        executionId: "submit-exec",
                    },
                },
                {
                    data: {
                        data: {
                            images: ["image-1"],
                        },
                        state: "completed",
                    },
                    meta: {
                        executionId: "poll-exec",
                    },
                },
            ];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_submit",
                    "-d",
                    "{\"prompt\":\"a cat\"}",
                    "--wait-result",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify(responses.shift()));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                data: {
                    images: ["image-1"],
                },
                meta: {
                    executionId: "poll-exec",
                    handle: 42,
                    pollAction: "openai_image_async_result",
                    pollCount: 1,
                    submitExecutionId: "submit-exec",
                },
            });
            await expect(requests[1]?.json()).resolves.toEqual({
                input: {
                    sessionID: 42,
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("runs async result actions once when --wait is omitted", async () => {
        const sandbox = await createCliSandbox();
        const sleepMock = createBunSleepMock();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createAsyncResultActionSchema());

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_result",
                    "-d",
                    "{\"sessionID\":\"session-1\"}",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: {
                                state: "processing",
                            },
                            meta: {
                                executionId: "poll-exec-1",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(JSON.parse(result.stdout)).toEqual({
                data: {
                    state: "processing",
                },
                meta: {
                    executionId: "poll-exec-1",
                },
            });
            expect(requests).toHaveLength(1);
            expect(sleepMock.sleepCalls).toEqual([]);
        }
        finally {
            sleepMock.restore();
            await sandbox.cleanup();
        }
    });

    test("renders async lifecycle progress to stderr for interactive connector run", async () => {
        const sandbox = await createCliSandbox();
        const sleepMock = createBunSleepMock();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                createAsyncResultActionSchema(),
            );

            const responses = [
                {
                    data: {
                        state: "processing",
                    },
                    meta: {
                        executionId: "poll-exec-1",
                    },
                },
                {
                    data: {
                        data: {
                            images: ["image-1"],
                        },
                        state: "completed",
                    },
                    meta: {
                        executionId: "poll-exec-2",
                    },
                },
            ];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_result",
                    "-d",
                    "{\"sessionID\":\"session-1\"}",
                    "--wait",
                ],
                {
                    fetcher: async () => new Response(JSON.stringify(responses.shift())),
                    stderr: {
                        isTTY: true,
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toContain("Waiting for async connector result");
            expect(result.stderr).toContain("Polling openai_image_async_result (poll 1, state processing)");
            expect(result.stderr).toContain("Completed openai_image_async_result (polls: 2)");
            expect(result.stdout).toContain("Result data:");
            expect(result.stdout).toContain("\"images\":");
        }
        finally {
            sleepMock.restore();
            await sandbox.cleanup();
        }
    });

    test("removes cached result schema after async connector wait reports action_not_found", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                createAsyncResultActionSchema({
                    description: "Cached result schema.",
                }),
            );

            const runResult = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_result",
                    "-d",
                    "{\"sessionID\":\"session-1\"}",
                    "--wait",
                    "--json",
                ],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        errorCode: "action_not_found",
                        success: false,
                    }), {
                        status: 404,
                    }),
                },
            );

            let metadataRequestCount = 0;
            const schemaResult = await sandbox.run(
                [
                    "connector",
                    "schema",
                    "fusion-api",
                    "--action",
                    "openai_image_async_result",
                ],
                {
                    fetcher: async () => {
                        metadataRequestCount += 1;

                        return new Response(JSON.stringify({
                            data: {
                                asyncLifecycle: {
                                    role: "result",
                                    wait: {
                                        intervalSeconds: 3,
                                        resultField: "data",
                                        state: {
                                            failure: ["not_found"],
                                            field: "state",
                                            running: ["processing"],
                                            success: ["completed"],
                                        },
                                    },
                                },
                                description: "Fresh result schema.",
                                inputSchema: {
                                    type: "object",
                                },
                                name: "openai_image_async_result",
                                outputSchema: {
                                    type: "object",
                                },
                                providerPermissions: [],
                                requiredScopes: [],
                                service: "fusion-api",
                            },
                        }));
                    },
                },
            );

            expect(runResult.exitCode).toBe(1);
            expect(runResult.stderr).toContain(
                "Connector action openai_image_async_result returned HTTP 404 (errorCode: action_not_found).",
            );
            expect(metadataRequestCount).toBe(1);
            expect(JSON.parse(schemaResult.stdout)).toMatchObject({
                description: "Fresh result schema.",
                name: "openai_image_async_result",
                service: "fusion-api",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails async connector completion when the configured result field is missing", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createAsyncResultActionSchema());

            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_result",
                    "-d",
                    "{\"sessionID\":\"session-1\"}",
                    "--wait",
                    "--json",
                ],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: {
                            state: "completed",
                        },
                        meta: {
                            executionId: "poll-exec",
                        },
                    })),
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "The async connector action poll response is missing result field data.",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not render async completion progress when final result extraction fails", async () => {
        const sandbox = await createCliSandbox();
        const sleepMock = createBunSleepMock();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createAsyncResultActionSchema());

            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_result",
                    "-d",
                    "{\"sessionID\":\"session-1\"}",
                    "--wait",
                ],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: {
                            state: "completed",
                        },
                        meta: {
                            executionId: "poll-exec",
                        },
                    })),
                    stderr: {
                        isTTY: true,
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain(
                "The async connector action poll response is missing result field data.",
            );
            expect(result.stderr).not.toContain(
                "Completed openai_image_async_result",
            );
        }
        finally {
            sleepMock.restore();
            await sandbox.cleanup();
        }
    });

    test("fails async connector wait when state field is missing", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createAsyncResultActionSchema());

            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_result",
                    "-d",
                    "{\"sessionID\":\"session-1\"}",
                    "--wait",
                    "--json",
                ],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: {
                            progress: 0.5,
                        },
                        meta: {
                            executionId: "poll-exec",
                        },
                    })),
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "The async connector action poll response is missing state field state.",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails async connector wait on configured failure state", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createAsyncResultActionSchema());

            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_result",
                    "-d",
                    "{\"sessionID\":\"session-1\"}",
                    "--wait",
                    "--json",
                ],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: {
                            state: "not_found",
                        },
                        meta: {
                            executionId: "poll-exec",
                        },
                    })),
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "The async connector action failed with state not_found.",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails async connector wait on unknown state", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createAsyncResultActionSchema());

            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_result",
                    "-d",
                    "{\"sessionID\":\"session-1\"}",
                    "--wait",
                    "--json",
                ],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: {
                            state: "queued",
                        },
                        meta: {
                            executionId: "poll-exec",
                        },
                    })),
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "The async connector action returned unsupported state queued.",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("times out async connector wait", async () => {
        const sandbox = await createCliSandbox();
        const originalDateNow = Date.now;
        let now = 0;
        const sleepMock = createBunSleepMock((durationMs) => {
            now += durationMs + 1;
        });

        try {
            Date.now = (() => now) as typeof Date.now;

            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                createAsyncResultActionSchema({
                    asyncLifecycle: {
                        role: "result",
                        wait: {
                            intervalSeconds: 6 * 3_600,
                            resultField: "data",
                            state: {
                                failure: ["not_found"],
                                field: "state",
                                running: ["processing"],
                                success: ["completed"],
                            },
                        },
                    },
                }),
            );

            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_result",
                    "-d",
                    "{\"sessionID\":\"session-1\"}",
                    "--wait",
                    "--json",
                ],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: {
                            state: "processing",
                        },
                        meta: {
                            executionId: "poll-exec",
                        },
                    })),
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "Timed out waiting for async connector action openai_image_async_result.",
            );
        }
        finally {
            Date.now = originalDateNow;
            sleepMock.restore();
            await sandbox.cleanup();
        }
    });

    test("rejects --wait on async submit actions before payload validation", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createAsyncSubmitActionSchema());

            let requestCount = 0;
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_submit",
                    "-d",
                    "{}",
                    "--wait",
                    "--json",
                ],
                {
                    fetcher: async () => {
                        requestCount += 1;

                        return new Response(JSON.stringify({
                            errorCode: "action_not_found",
                            success: false,
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "The --wait option is only supported for connector actions with an async result lifecycle.",
            );
            expect(result.stderr).not.toContain("input payload is invalid");
            expect(requestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects --wait on regular connector actions after confirming with the metadata API", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            // A lifecycle-less cache entry (like the ones seeded from search
            // results) is not trusted for wait modes; the run consults the
            // metadata API once before rejecting the wait request.
            await seedConnectorActionSchema(sandbox, createConnectorActionFixture());

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "--action",
                    "send_mail",
                    "--data",
                    "{}",
                    "--wait",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.method === "GET") {
                            return new Response(JSON.stringify({
                                data: createConnectorActionFixture(),
                            }));
                        }

                        return new Response(JSON.stringify({
                            data: {
                                messageId: "message-1",
                            },
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "The --wait option is only supported for connector actions with an async result lifecycle.",
            );
            expect(requests.map(request => request.method)).toEqual(["GET"]);
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects --wait-result on async result actions before sending requests", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createAsyncResultActionSchema());

            let requestCount = 0;
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_result",
                    "-d",
                    "{\"sessionID\":\"session-1\"}",
                    "--wait-result",
                    "--json",
                ],
                {
                    fetcher: async () => {
                        requestCount += 1;

                        return new Response(JSON.stringify({
                            data: {
                                state: "completed",
                            },
                            meta: {
                                executionId: "poll-exec",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "The --wait-result option is only supported for connector actions with an async submit lifecycle.",
            );
            expect(requestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects --wait-result on regular connector actions after confirming with the metadata API", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            // A lifecycle-less cache entry (like the ones seeded from search
            // results) is not trusted for wait modes; the run consults the
            // metadata API once before rejecting the wait request.
            await seedConnectorActionSchema(sandbox, createConnectorActionFixture());

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "--action",
                    "send_mail",
                    "--data",
                    "{}",
                    "--wait-result",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.method === "GET") {
                            return new Response(JSON.stringify({
                                data: createConnectorActionFixture(),
                            }));
                        }

                        return new Response(JSON.stringify({
                            data: {
                                messageId: "message-1",
                            },
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "The --wait-result option is only supported for connector actions with an async submit lifecycle.",
            );
            expect(requests.map(request => request.method)).toEqual(["GET"]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects conflicting async wait modes before payload validation", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createAsyncSubmitActionSchema());

            let requestCount = 0;
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_submit",
                    "-d",
                    "{}",
                    "--wait",
                    "--wait-result",
                    "--json",
                ],
                {
                    fetcher: async () => {
                        requestCount += 1;

                        return new Response(JSON.stringify({
                            data: {
                                sessionId: "session-1",
                            },
                            meta: {
                                executionId: "submit-exec",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "Use either --wait or --wait-result, not both.",
            );
            expect(result.stderr).not.toContain("input payload is invalid");
            expect(requestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects conflicting async wait modes before auth and data loading", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_submit",
                    "-d",
                    "@missing-input.json",
                    "--wait",
                    "--wait-result",
                    "--json",
                ],
            );

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "Use either --wait or --wait-result, not both.",
            );
            expect(result.stderr).not.toContain("Log in first");
            expect(result.stderr).not.toContain("Failed to read input");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("trims connector action names before cache lookup and request", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                createConnectorActionFixture(),
            );

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    " send_mail ",
                    "-d",
                    "{\"to\":\"foo@bar.com\"}",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: {
                                messageId: "message-1",
                            },
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                data: {
                    messageId: "message-1",
                },
                meta: {
                    executionId: "exec-1",
                },
            });
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders connector run text output with clear result-data emphasis", async () => {
        const sandbox = await createCliSandbox();
        const colors = createTerminalColors(true);

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                {
                    description: "Send a Gmail message.",
                    inputSchema: {
                        properties: {
                            to: {
                                format: "email",
                                type: "string",
                            },
                        },
                        required: ["to"],
                        type: "object",
                    },
                    name: "send_mail",
                    outputSchema: {
                        type: "object",
                    },
                    service: "gmail",
                },
            );

            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "-d",
                    "{\"to\":\"foo@bar.com\"}",
                ],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: {
                            body: "Hello",
                            messageId: "message-1",
                        },
                        meta: {
                            executionId: "exec-1",
                        },
                    })),
                    stdout: {
                        hasColors: true,
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain(colors.hex("#59F78D")("exec-1"));
            expect(result.stdout).toContain(colors.bold("Result data:"));
            expect(result.stdout).toContain("\u001B[36m{\n");
            expect(result.stdout).toContain("\"messageId\": \"message-1\"");
            expect(result.stdout).not.toContain(colors.gray("{"));
            expect(result.stdout).not.toContain("\u001B[90m");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("loads connector action metadata and supports dry-run when the schema cache is missing", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "-d",
                    "{\"to\":\"foo@bar.com\"}",
                    "--dry-run",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        return new Response(JSON.stringify({
                            data: {
                                description: "Send a Gmail message.",
                                id: "action-1",
                                inputSchema: {
                                    properties: {
                                        to: {
                                            format: "email",
                                            type: "string",
                                        },
                                    },
                                    required: ["to"],
                                    type: "object",
                                },
                                name: "send_mail",
                                outputSchema: {
                                    type: "object",
                                },
                                providerPermissions: [],
                                requiredScopes: [],
                                service: "gmail",
                            },
                        }));
                    },
                },
            );

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
            expect(JSON.parse(result.stdout)).toEqual({
                dryRun: true,
                ok: true,
            });
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("validates connector run payloads before sending the action request", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                {
                    description: "Send a Gmail message.",
                    inputSchema: {
                        properties: {
                            to: {
                                format: "email",
                                type: "string",
                            },
                        },
                        required: ["to"],
                        type: "object",
                    },
                    name: "send_mail",
                    outputSchema: {
                        type: "object",
                    },
                    service: "gmail",
                },
            );

            let requestCount = 0;
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "-d",
                    "{\"to\":\"not-an-email\"}",
                ],
                {
                    fetcher: async () => {
                        requestCount += 1;

                        return new Response(JSON.stringify({
                            data: {
                                messageId: "message-1",
                            },
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(result.exitCode).toBe(2);
            expect(requestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("logs connector run failure details and surfaces the server message", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                {
                    description: "Get a Gmail message by id.",
                    inputSchema: {
                        properties: {
                            messageId: {
                                type: "string",
                            },
                        },
                        required: ["messageId"],
                        type: "object",
                    },
                    name: "get_message",
                    outputSchema: {
                        type: "object",
                    },
                    service: "gmail",
                },
            );

            const result = await sandbox.run(
                [
                    "--debug",
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "get_message",
                    "--connection-name",
                    "secret-work-connection",
                    "-d",
                    "{\"messageId\":\"invalid-id\"}",
                ],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        errorCode: "invalid_input",
                        message: "Invalid id value",
                        meta: {
                            actionId: "gmail.get_message",
                            executionId: "exec-1",
                        },
                        success: false,
                    }), {
                        status: 400,
                    }),
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "Connector action get_message returned HTTP 400 (errorCode: invalid_input): Invalid id value",
            );
            expect(content).toContain(
                "\"msg\":\"Connector action run request returned a non-success status.\"",
            );
            expect(content).toContain("\"responseMessage\":\"Invalid id value\"");
            expect(content).toContain("\"errorCode\":\"invalid_input\"");
            expect(content).toContain("\"executionId\":\"exec-1\"");
            expect(content).not.toContain("\"responseBody\":");
            // Always-on diagnostics are present even when structured fields exist.
            expect(content).toContain("\"responseBodyLength\":");
            // Preview is NOT included when structured fields are present.
            expect(content).not.toContain("\"rawResponsePreview\":");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    action: "get_message",
                    command_full: "connector.run",
                    connection_selector: "connectionName",
                    data_size_bucket: "<1KB",
                    dry_run: false,
                    error_code: "invalid_input",
                    http_status: 400,
                    service: "gmail",
                    wait: false,
                },
            });
            expect(JSON.stringify(telemetryPayload?.properties)).not.toContain(
                "secret-work-connection",
            );
            expect(JSON.stringify(telemetryPayload?.properties)).not.toContain(
                "Invalid id value",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("surfaces failing async result action name and html body diagnostics on non-standard 500", async () => {
        const sandbox = await createCliSandbox();
        const sleepMock = createBunSleepMock();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                createAsyncResultActionSchema(),
            );

            const result = await sandbox.run(
                [
                    "--debug",
                    "connector",
                    "run",
                    "fusion-api",
                    "-a",
                    "openai_image_async_result",
                    "-d",
                    "{\"sessionID\":\"session-1\"}",
                    "--wait",
                    "--json",
                ],
                {
                    fetcher: async () => new Response(
                        "<html><body>Internal Server Error</body></html>",
                        {
                            headers: {
                                "cf-ray": "abcdef1234-SJC",
                                "content-type": "text/html; charset=utf-8",
                                "x-request-id": "req-abc-123",
                            },
                            status: 500,
                        },
                    ),
                },
            );

            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(1);
            // The raw body is surfaced to stderr when no structured failure
            // fields are present, so the operator sees the detail directly.
            expect(result.stderr).toContain(
                "Connector action openai_image_async_result returned HTTP 500: <html><body>Internal Server Error</body></html>",
            );
            expect(content).toContain("\"actionName\":\"openai_image_async_result\"");
            // Safe bounded diagnostics:
            expect(content).toContain("\"responseBodyLength\":");
            expect(content).toContain("\"responseContentType\":\"text/html; charset=utf-8\"");
            expect(content).toContain("\"x-request-id\":\"req-abc-123\"");
            expect(content).toContain("\"cf-ray\":\"abcdef1234-SJC\"");
            // No structured failure fields → preview IS included.
            expect(content).toContain("\"rawResponsePreview\":");
            expect(content).toContain("Internal Server Error");
            // Full response body field never appears (legacy guarantee preserved).
            expect(content).not.toContain("\"responseBody\":");
        }
        finally {
            sleepMock.restore();
            await sandbox.cleanup();
        }
    });

    test("emits responseBodyLength but no preview for empty 500 body", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                {
                    description: "Send a Gmail message.",
                    inputSchema: {
                        type: "object",
                    },
                    name: "send_mail",
                    outputSchema: {
                        type: "object",
                    },
                    service: "gmail",
                },
            );

            const result = await sandbox.run(
                [
                    "--debug",
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "-d",
                    "{}",
                ],
                {
                    fetcher: async () => new Response("", { status: 500 }),
                },
            );

            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain(
                "Connector action send_mail returned HTTP 500.",
            );
            expect(content).toContain("\"responseBodyLength\":0");
            // Preview MUST NOT be emitted for empty bodies, even though there are
            // no structured failure fields.
            expect(content).not.toContain("\"rawResponsePreview\":");
            expect(content).not.toContain("\"responseBody\":");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("emits truncated preview for non-schema JSON 500 body", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                {
                    description: "Send a Gmail message.",
                    inputSchema: {
                        type: "object",
                    },
                    name: "send_mail",
                    outputSchema: {
                        type: "object",
                    },
                    service: "gmail",
                },
            );

            const oversizedDetail = "x".repeat(2000);
            const result = await sandbox.run(
                [
                    "--debug",
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "-d",
                    "{}",
                ],
                {
                    fetcher: async () => new Response(
                        JSON.stringify({
                            // Not the connector failure schema shape: no message /
                            // errorCode / meta.executionId.
                            detail: oversizedDetail,
                            something: "else",
                        }),
                        {
                            headers: {
                                "content-type": "application/json",
                            },
                            status: 500,
                        },
                    ),
                },
            );

            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(1);
            // The raw body is surfaced to stderr, but bounded so the oversized
            // detail is truncated rather than dumped in full.
            expect(result.stderr).toContain(
                "Connector action send_mail returned HTTP 500: {\"detail\":\"xxx",
            );
            expect(result.stderr).not.toContain(oversizedDetail);
            expect(result.stderr).toContain("...");
            expect(content).toContain("\"responseBodyLength\":");
            expect(content).toContain("\"responseContentType\":\"application/json\"");
            expect(content).toContain("\"rawResponsePreview\":");
            // The preview is truncated with a marker — full 2000-char body should not be in the log.
            expect(content).not.toContain(oversizedDetail);
            // Ensure the truncation marker is present.
            expect(content).toContain("...\"");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("emits preview for empty-object failure body that matches the schema but has no useful fields", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                {
                    description: "Send a Gmail message.",
                    inputSchema: {
                        type: "object",
                    },
                    name: "send_mail",
                    outputSchema: {
                        type: "object",
                    },
                    service: "gmail",
                },
            );

            const result = await sandbox.run(
                [
                    "--debug",
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "-d",
                    "{}",
                ],
                {
                    fetcher: async () => new Response(
                        JSON.stringify({}),
                        {
                            headers: {
                                "content-type": "application/json",
                            },
                            status: 500,
                        },
                    ),
                },
            );

            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(1);
            // No useful structured fields → the raw body is surfaced to stderr.
            expect(result.stderr).toContain(
                "Connector action send_mail returned HTTP 500: {}",
            );
            // Schema parsed successfully but no useful fields → still include preview.
            expect(content).toContain("\"rawResponsePreview\":\"{}\"");
            expect(content).toContain("\"responseBodyLength\":2");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports connector schema with default json output and hides internal metadata fields", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["connector", "schema", "gmail", "--action", "send_mail"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: {
                                description: "Send a Gmail message.",
                                followUpActions: [
                                    {
                                        name: "get_message",
                                    },
                                ],
                                id: "gmail.send_mail",
                                inputSchema: {
                                    properties: {
                                        to: {
                                            type: "string",
                                        },
                                    },
                                    required: ["to"],
                                    type: "object",
                                },
                                name: "send_mail",
                                outputSchema: {
                                    type: "object",
                                },
                                providerPermissions: ["gmail.send"],
                                requiredScopes: ["gmail.send"],
                                service: "gmail",
                            },
                        }));
                    },
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );
            const cachedResult = await sandbox.run(
                ["connector", "schema", "gmail", "--action", "send_mail", "--json"],
                {
                    fetcher: async () => {
                        throw new Error("Unexpected schema metadata request");
                    },
                },
            );

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(JSON.parse(result.stdout)).toEqual({
                description: "Send a Gmail message.",
                inputSchema: {
                    properties: {
                        to: {
                            type: "string",
                        },
                    },
                    required: ["to"],
                    type: "object",
                },
                name: "send_mail",
                outputSchema: {
                    type: "object",
                },
                service: "gmail",
            });
            expect(result.stdout).not.toContain("providerPermissions");
            expect(result.stdout).not.toContain("requiredScopes");
            expect(result.stdout).not.toContain("followUpActions");
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
            expect(JSON.parse(cachedResult.stdout)).toEqual(JSON.parse(result.stdout));
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "connector.schema",
                    refresh: false,
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("action");
            expect(telemetryPayload?.properties).not.toHaveProperty("service");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports connector schema output for async lifecycle actions", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "schema",
                    "fusion-api",
                    "--action",
                    "openai_image_async_submit",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.endsWith("openai_image_async_submit")) {
                            return new Response(JSON.stringify({
                                data: {
                                    asyncLifecycle: {
                                        role: "submit",
                                        resultAction: "openai_image_async_result",
                                        handle: {
                                            inputField: "sessionID",
                                            outputField: "sessionId",
                                        },
                                    },
                                    description: "Submit OpenAI image generation.",
                                    inputSchema: {
                                        type: "object",
                                    },
                                    name: "openai_image_async_submit",
                                    outputSchema: {
                                        properties: {
                                            sessionId: {
                                                type: "string",
                                            },
                                        },
                                        type: "object",
                                    },
                                    providerPermissions: [],
                                    requiredScopes: [],
                                    service: "fusion-api",
                                },
                            }));
                        }

                        return new Response("unexpected", {
                            status: 500,
                        });
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toMatchObject({
                name: "openai_image_async_submit",
                outputSchema: {
                    properties: {
                        sessionId: {
                            type: "string",
                        },
                    },
                    type: "object",
                },
                service: "fusion-api",
            });
            expect(requests.map(request => request.url)).toEqual([
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_submit",
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("returns a JSON object for a single qualified action id", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["connector", "schema", "gmail.send_mail"],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: {
                                description: "Send a Gmail message.",
                                id: "gmail.send_mail",
                                inputSchema: {
                                    type: "object",
                                },
                                name: "send_mail",
                                outputSchema: {
                                    type: "object",
                                },
                                providerPermissions: [],
                                requiredScopes: [],
                                service: "gmail",
                            },
                        }));
                    },
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(Array.isArray(JSON.parse(result.stdout))).toBe(false);
            expect(JSON.parse(result.stdout)).toEqual({
                description: "Send a Gmail message.",
                inputSchema: {
                    type: "object",
                },
                name: "send_mail",
                outputSchema: {
                    type: "object",
                },
                service: "gmail",
            });
            expect(requests.map(request => request.url)).toEqual([
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            ]);
            expect(telemetryPayload).toMatchObject({
                properties: {
                    action_count_bucket: "1-5",
                    command_full: "connector.schema",
                    qualified: true,
                    refresh: false,
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports connector schema for multiple qualified action ids with array output", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "schema",
                    "cal.create_schedule",
                    "callingly.get_agent_schedule",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.endsWith("cal.create_schedule")) {
                            return new Response(JSON.stringify({
                                data: {
                                    description: "Create a schedule.",
                                    id: "cal.create_schedule",
                                    inputSchema: {
                                        type: "object",
                                    },
                                    name: "create_schedule",
                                    outputSchema: {
                                        type: "object",
                                    },
                                    providerPermissions: [],
                                    requiredScopes: [],
                                    service: "cal",
                                },
                            }));
                        }

                        return new Response(JSON.stringify({
                            data: {
                                description: "Get an agent schedule.",
                                id: "callingly.get_agent_schedule",
                                inputSchema: {
                                    type: "object",
                                },
                                name: "get_agent_schedule",
                                outputSchema: {
                                    type: "object",
                                },
                                providerPermissions: [],
                                requiredScopes: [],
                                service: "callingly",
                            },
                        }));
                    },
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            // Two action ids widen the output to an array in request order.
            expect(JSON.parse(result.stdout)).toEqual([
                {
                    description: "Create a schedule.",
                    inputSchema: {
                        type: "object",
                    },
                    name: "create_schedule",
                    outputSchema: {
                        type: "object",
                    },
                    service: "cal",
                },
                {
                    description: "Get an agent schedule.",
                    inputSchema: {
                        type: "object",
                    },
                    name: "get_agent_schedule",
                    outputSchema: {
                        type: "object",
                    },
                    service: "callingly",
                },
            ]);
            expect(result.stdout).not.toContain("providerPermissions");
            expect(requests.map(request => request.url)).toEqual([
                "https://connector.oomol.com/v1/actions/cal.create_schedule",
                "https://connector.oomol.com/v1/actions/callingly.get_agent_schedule",
            ]);
            expect(telemetryPayload).toMatchObject({
                properties: {
                    action_count_bucket: "1-5",
                    command_full: "connector.schema",
                    qualified: true,
                    refresh: false,
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects a malformed action id that is missing the service separator", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            let metadataRequestCount = 0;
            const result = await sandbox.run(
                ["connector", "schema", "send_mail"],
                {
                    fetcher: async () => {
                        metadataRequestCount += 1;

                        throw new Error("Unexpected schema metadata request");
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("Invalid action id");
            expect(result.stderr).toContain("send_mail");
            // The identifier is parsed before any account lookup or request.
            expect(metadataRequestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects the legacy --action option combined with multiple service names", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            let metadataRequestCount = 0;
            const result = await sandbox.run(
                [
                    "connector",
                    "schema",
                    "gmail",
                    "calendar",
                    "--action",
                    "send_mail",
                ],
                {
                    fetcher: async () => {
                        metadataRequestCount += 1;

                        throw new Error("Unexpected schema metadata request");
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("--action");
            expect(metadataRequestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects the legacy --action option combined with a qualified action id", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            let metadataRequestCount = 0;
            const result = await sandbox.run(
                [
                    "connector",
                    "schema",
                    "cal.create_schedule",
                    "--action",
                    "send_mail",
                ],
                {
                    fetcher: async () => {
                        metadataRequestCount += 1;

                        throw new Error("Unexpected schema metadata request");
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stderr).toContain("--action");
            // Mixing syntaxes is rejected before any doomed metadata request.
            expect(metadataRequestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("records legacy telemetry when --action selects the action name", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(
                ["connector", "schema", "gmail", "--action", "send_mail"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        data: {
                            description: "Send a Gmail message.",
                            id: "gmail.send_mail",
                            inputSchema: {
                                type: "object",
                            },
                            name: "send_mail",
                            outputSchema: {
                                type: "object",
                            },
                            providerPermissions: [],
                            requiredScopes: [],
                            service: "gmail",
                        },
                    })),
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(0);
            expect(Array.isArray(JSON.parse(result.stdout))).toBe(false);
            expect(telemetryPayload).toMatchObject({
                properties: {
                    action_count_bucket: "1-5",
                    command_full: "connector.schema",
                    qualified: false,
                    refresh: false,
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports connector schema refresh by bypassing cached metadata", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                createConnectorActionFixture({
                    description: "Cached schema.",
                }),
            );

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "schema",
                    "gmail",
                    "--action",
                    "send_mail",
                    "--refresh",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: {
                                description: "Fresh schema.",
                                id: "gmail.send_mail",
                                inputSchema: {
                                    type: "object",
                                },
                                name: "send_mail",
                                outputSchema: {
                                    type: "object",
                                },
                                providerPermissions: [],
                                requiredScopes: [],
                                service: "gmail",
                            },
                        }));
                    },
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(JSON.parse(result.stdout)).toMatchObject({
                description: "Fresh schema.",
                name: "send_mail",
                service: "gmail",
            });
            expect(requests).toHaveLength(1);
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "connector.schema",
                    refresh: true,
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports connector schema refresh subcommand by clearing cached metadata", async () => {
        const sandbox = await createCliSandbox();

        try {
            await seedConnectorActionSchema(
                sandbox,
                createConnectorActionFixture({
                    description: "Cached schema.",
                }),
            );

            const refreshResult = await sandbox.run(
                ["connector", "schema", "refresh"],
                {
                    fetcher: async () => {
                        throw new Error("Unexpected schema refresh request");
                    },
                },
            );

            await writeAuthFile(sandbox);

            let metadataRequestCount = 0;
            const schemaResult = await sandbox.run(
                ["connector", "schema", "gmail", "--action", "send_mail"],
                {
                    fetcher: async () => {
                        metadataRequestCount += 1;

                        return new Response(JSON.stringify({
                            data: {
                                description: "Fresh schema after cache refresh.",
                                id: "gmail.send_mail",
                                inputSchema: {
                                    type: "object",
                                },
                                name: "send_mail",
                                outputSchema: {
                                    type: "object",
                                },
                                providerPermissions: [],
                                requiredScopes: [],
                                service: "gmail",
                            },
                        }));
                    },
                },
            );

            expect(createCliSnapshot(refreshResult)).toMatchSnapshot();
            expect(metadataRequestCount).toBe(1);
            expect(JSON.parse(schemaResult.stdout)).toMatchObject({
                description: "Fresh schema after cache refresh.",
                name: "send_mail",
                service: "gmail",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("removes cached schema after connector run reports action_not_found", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox);

            const runResult = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "--action",
                    "send_mail",
                    "--data",
                    "{}",
                    "--json",
                ],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        errorCode: "action_not_found",
                        success: false,
                    }), {
                        status: 404,
                    }),
                },
            );

            let metadataRequestCount = 0;
            const schemaResult = await sandbox.run(
                ["connector", "schema", "gmail", "--action", "send_mail"],
                {
                    fetcher: async () => {
                        metadataRequestCount += 1;

                        return new Response(JSON.stringify({
                            data: {
                                description: "Fresh schema after stale cache removal.",
                                id: "gmail.send_mail",
                                inputSchema: {
                                    type: "object",
                                },
                                name: "send_mail",
                                outputSchema: {
                                    type: "object",
                                },
                                providerPermissions: [],
                                requiredScopes: [],
                                service: "gmail",
                            },
                        }));
                    },
                },
            );

            expect(runResult.exitCode).toBe(1);
            expect(runResult.stderr).toContain(
                "Connector action send_mail returned HTTP 404 (errorCode: action_not_found).",
            );
            expect(metadataRequestCount).toBe(1);
            expect(JSON.parse(schemaResult.stdout)).toMatchObject({
                description: "Fresh schema after stale cache removal.",
                name: "send_mail",
                service: "gmail",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("runs a connector action under a team identity from --team", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createConnectorActionFixture());

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "-d",
                    "{\"to\":\"foo@bar.com\"}",
                    "--team",
                    "acme",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: {
                                messageId: "message-1",
                            },
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(requests[0]?.method).toBe("POST");
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
            expect(requests[0]?.headers.get("x-oo-team-name")).toBe("acme");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "connector.run",
                    identity_source: "flag",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("team");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("keeps the action schema request identity-free while the run carries the team identity", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "-d",
                    "{\"to\":\"foo@bar.com\"}",
                    "--team",
                    "acme",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.method === "GET") {
                            return new Response(JSON.stringify({
                                data: {
                                    description: "Send a Gmail message.",
                                    id: "gmail.send_mail",
                                    inputSchema: {
                                        properties: {
                                            to: {
                                                type: "string",
                                            },
                                        },
                                        required: ["to"],
                                        type: "object",
                                    },
                                    name: "send_mail",
                                    outputSchema: {
                                        type: "object",
                                    },
                                    providerPermissions: [],
                                    requiredScopes: [],
                                    service: "gmail",
                                },
                            }));
                        }

                        return new Response(JSON.stringify({
                            data: {
                                messageId: "message-1",
                            },
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(2);
            // The schema metadata GET stays identity-free (shared schema cache).
            expect(requests[0]?.method).toBe("GET");
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
            expect(requests[0]?.headers.get("x-oo-team-name")).toBeNull();
            // The run POST carries the team identity.
            expect(requests[1]?.method).toBe("POST");
            expect(requests[1]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
            expect(requests[1]?.headers.get("x-oo-team-name")).toBe("acme");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uses the configured default team when no identity flag is provided", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createConnectorActionFixture());
            await sandbox.run(["config", "set", "identity.team", "acme"]);

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "-d",
                    "{\"to\":\"foo@bar.com\"}",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: {
                                messageId: "message-1",
                            },
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );
            const telemetryRows = readTelemetryRowsForTest(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
            );
            const runTelemetryPayload = telemetryRows
                .map(row => parseTelemetryRowPayload(row))
                .find(payload => payload?.properties?.command_full === "connector.run");

            expect(result.exitCode).toBe(0);
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
            expect(requests[0]?.headers.get("x-oo-team-name")).toBe("acme");
            expect(runTelemetryPayload).toMatchObject({
                properties: {
                    identity_source: "config",
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("forces the personal identity with --personal even when a default team is configured", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createConnectorActionFixture());
            await sandbox.run(["config", "set", "identity.team", "acme"]);

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "-d",
                    "{\"to\":\"foo@bar.com\"}",
                    "--personal",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        requests.push(toRequest(input, init));

                        return new Response(JSON.stringify({
                            data: {
                                messageId: "message-1",
                            },
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );
            const telemetryRows = readTelemetryRowsForTest(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
            );
            const runTelemetryPayload = telemetryRows
                .map(row => parseTelemetryRowPayload(row))
                .find(payload => payload?.properties?.command_full === "connector.run");

            expect(result.exitCode).toBe(0);
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
            expect(requests[0]?.headers.get("x-oo-team-name")).toBeNull();
            expect(runTelemetryPayload).toMatchObject({
                properties: {
                    identity_source: "personal",
                },
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects an empty --team value before sending requests", async () => {
        const sandbox = await createCliSandbox();

        try {
            let requestCount = 0;
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "-d",
                    "{\"to\":\"foo@bar.com\"}",
                    "--team",
                    "   ",
                    "--json",
                ],
                {
                    fetcher: async () => {
                        requestCount += 1;

                        return new Response(JSON.stringify({
                            data: {},
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "The --team value cannot be empty.",
            );
            expect(requestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects combining --team and --personal before sending requests", async () => {
        const sandbox = await createCliSandbox();

        try {
            let requestCount = 0;
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "-d",
                    "{\"to\":\"foo@bar.com\"}",
                    "--team",
                    "acme",
                    "--personal",
                    "--json",
                ],
                {
                    fetcher: async () => {
                        requestCount += 1;

                        return new Response(JSON.stringify({
                            data: {},
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "Use either --team or --personal, not both.",
            );
            expect(requestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("runs connector search via OO_API_KEY without login and routes through OO_ENDPOINT", async () => {
        const sandbox = await createCliSandbox();

        // Drive execution purely from env: no login, no auth.toml on disk.
        sandbox.env.OO_API_KEY = "env-api-key";
        sandbox.env.OO_ENDPOINT = "oomol.dev";

        const authFilePath = join(
            sandbox.env.XDG_CONFIG_HOME!,
            APP_NAME,
            "auth.toml",
        );
        const requests: Request[] = [];

        try {
            const result = await sandbox.run(
                ["connector", "search", "send mail", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        return new Response(JSON.stringify({ data: [] }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain("[]");
            expect(requests).toHaveLength(1);
            // OO_ENDPOINT must drive the execution endpoint derivation.
            expect(requests[0]!.url).toStartWith(
                "https://connector.oomol.dev/v1/actions/search",
            );
            // OO_API_KEY must be used as the Authorization credential.
            expect(requests[0]!.headers.get("Authorization")).toBe("env-api-key");
            // The env override must never read or create auth.toml.
            await expect(Bun.file(authFilePath).exists()).resolves.toBeFalse();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("redirects a logged-in account's execution endpoint with OO_ENDPOINT", async () => {
        const sandbox = await createCliSandbox();

        // A persisted account (endpoint oomol.com) plus a bare OO_ENDPOINT, no
        // OO_API_KEY: the saved credential is kept but the endpoint is redirected.
        await writeAuthFile(sandbox);
        sandbox.env.OO_ENDPOINT = "oomol.dev";

        const requests: Request[] = [];

        try {
            const result = await sandbox.run(
                ["connector", "search", "send mail", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        return new Response(JSON.stringify({ data: [] }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(requests).toHaveLength(1);
            expect(requests[0]!.url).toStartWith(
                "https://connector.oomol.dev/v1/actions/search",
            );
            // The persisted API key is still used as the credential.
            expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("runs a connector action against a self-hosted connector without an OOMOL account", async () => {
        const sandbox = await createCliSandbox();

        try {
            // Only connector.toml is configured: no auth file exists on disk.
            await writeConnectorFile(sandbox, {
                url: "http://localhost:3000",
                token: "oct_test",
            });

            const requests: Request[] = [];
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "-d",
                    "{\"to\":\"foo@bar.com\"}",
                    "--json",
                ],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.method === "GET") {
                            return new Response(JSON.stringify({
                                data: {
                                    description: "Send a Gmail message.",
                                    inputSchema: {
                                        properties: {
                                            to: {
                                                type: "string",
                                            },
                                        },
                                        required: ["to"],
                                        type: "object",
                                    },
                                    name: "send_mail",
                                    outputSchema: {
                                        type: "object",
                                    },
                                    providerPermissions: [],
                                    requiredScopes: [],
                                    service: "gmail",
                                },
                            }));
                        }

                        return new Response(JSON.stringify({
                            data: {
                                messageId: "message-1",
                            },
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(JSON.parse(result.stdout)).toEqual({
                data: {
                    messageId: "message-1",
                },
                meta: {
                    executionId: "exec-1",
                },
            });
            expect(requests).toHaveLength(2);
            // The schema lookup hits the self-hosted server first, then the run POST.
            expect(requests[0]?.method).toBe("GET");
            expect(requests[0]?.url).toBe(
                "http://localhost:3000/v1/actions/gmail.send_mail",
            );
            expect(requests[0]?.headers.get("Authorization")).toBe("Bearer oct_test");
            expect(requests[1]?.method).toBe("POST");
            expect(requests[1]?.url).toBe(
                "http://localhost:3000/v1/actions/gmail.send_mail",
            );
            expect(requests[1]?.headers.get("Authorization")).toBe("Bearer oct_test");
            await expect(requests[1]?.json()).resolves.toEqual({
                input: {
                    to: "foo@bar.com",
                },
            });
            // The self-hosted flow never needs or creates auth.toml.
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await expect(Bun.file(authFilePath).exists()).resolves.toBeFalse();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects --team for a self-hosted connector before any request", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeConnectorFile(sandbox, {
                url: "http://localhost:3000",
                token: "oct_test",
            });

            let requestCount = 0;
            const result = await sandbox.run(
                [
                    "connector",
                    "run",
                    "gmail",
                    "-a",
                    "send_mail",
                    "-d",
                    "{\"to\":\"foo@bar.com\"}",
                    "--team",
                    "acme",
                    "--json",
                ],
                {
                    fetcher: async () => {
                        requestCount += 1;

                        return new Response(JSON.stringify({
                            data: {},
                            meta: {
                                executionId: "exec-1",
                            },
                        }));
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "The --team option is not supported by a self-hosted connector.",
            );
            expect(requestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prefers connector.toml over a saved account and OO_API_KEY over connector.toml", async () => {
        const sandbox = await createCliSandbox();

        try {
            // Both an OOMOL account and a self-hosted connector are configured.
            await writeAuthFile(sandbox);
            await writeConnectorFile(sandbox, {
                url: "http://localhost:3000",
                token: "oct_test",
            });

            const selfHostedRequests: Request[] = [];
            const selfHostedResult = await sandbox.run(
                ["connector", "search", "send mail", "--json"],
                {
                    fetcher: async (input, init) => {
                        selfHostedRequests.push(toRequest(input, init));

                        return new Response(JSON.stringify({ data: [] }));
                    },
                },
            );

            expect(selfHostedResult.exitCode).toBe(0);
            expect(selfHostedRequests).toHaveLength(1);
            // The persisted self-hosted connector wins over the saved account.
            expect(selfHostedRequests[0]!.url).toStartWith(
                "http://localhost:3000/v1/actions/search",
            );
            expect(selfHostedRequests[0]!.headers.get("Authorization")).toBe(
                "Bearer oct_test",
            );

            // An explicit OO_API_KEY env credential outranks connector.toml.
            sandbox.env.OO_API_KEY = "env-api-key";

            const envRequests: Request[] = [];
            const envResult = await sandbox.run(
                ["connector", "search", "send mail", "--json"],
                {
                    fetcher: async (input, init) => {
                        envRequests.push(toRequest(input, init));

                        return new Response(JSON.stringify({ data: [] }));
                    },
                },
            );

            expect(envResult.exitCode).toBe(0);
            expect(envRequests).toHaveLength(1);
            expect(envRequests[0]!.url).toStartWith(
                "https://connector.oomol.com/v1/actions/search",
            );
            expect(envRequests[0]!.headers.get("Authorization")).toBe("env-api-key");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uses the wire authenticated field for self-hosted top-level search results", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeConnectorFile(sandbox, {
                url: "http://localhost:3000",
                token: "oct_test",
            });

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["search", "send mail", "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        return createConnectorSearchResponse([
                            {
                                authenticated: true,
                                description: "Send a Gmail message.",
                                name: "send_mail",
                                service: "gmail",
                            },
                        ]);
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(requests.map(request => request.url)).toEqual([
                "http://localhost:3000/v1/actions/search?q=send+mail",
            ]);
            expect(requests[0]?.headers.get("Authorization")).toBe("Bearer oct_test");
            expect(JSON.parse(result.stdout)).toEqual([
                {
                    authenticated: true,
                    description: "Send a Gmail message.",
                    name: "send_mail",
                    service: "gmail",
                },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

type SeedConnectorAction = ConnectorActionDefinition & Partial<Pick<
    ConnectorActionMetadata,
    "asyncLifecycle" | "providerPermissions" | "requiredScopes"
>>;

function createAsyncSubmitActionSchema(
    overrides: Partial<SeedConnectorAction> = {},
): SeedConnectorAction {
    return {
        asyncLifecycle: {
            role: "submit",
            resultAction: "openai_image_async_result",
            handle: {
                inputField: "sessionID",
                outputField: "sessionId",
            },
        },
        description: "Submit OpenAI image generation.",
        inputSchema: {
            properties: {
                prompt: {
                    type: "string",
                },
            },
            required: ["prompt"],
            type: "object",
        },
        name: "openai_image_async_submit",
        outputSchema: {
            properties: {
                sessionId: {
                    type: "string",
                },
            },
            required: ["sessionId"],
            type: "object",
        },
        service: "fusion-api",
        ...overrides,
    };
}

function createAsyncResultActionSchema(
    overrides: Partial<SeedConnectorAction> = {},
): SeedConnectorAction {
    return {
        asyncLifecycle: {
            role: "result",
            wait: {
                intervalSeconds: 3,
                resultField: "data",
                state: {
                    failure: ["not_found"],
                    field: "state",
                    running: ["processing"],
                    success: ["completed"],
                },
            },
        },
        description: "Get OpenAI image generation result.",
        inputSchema: {
            properties: {
                sessionID: {
                    type: "string",
                },
            },
            required: ["sessionID"],
            type: "object",
        },
        name: "openai_image_async_result",
        outputSchema: {
            type: "object",
        },
        service: "fusion-api",
        ...overrides,
    };
}

function createConnectorSearchResponse(
    actions: Array<{
        authenticated: boolean;
        description: string;
        inputSchema?: Record<string, unknown>;
        name: string;
        outputSchema?: Record<string, unknown>;
        service: string;
    }>,
): Response {
    return new Response(JSON.stringify({
        success: true,
        message: "ok",
        data: actions,
    }));
}

function createBunSleepMock(onSleep?: (durationMs: number) => void) {
    const originalSleep = Bun.sleep;
    const sleepCalls: number[] = [];

    Bun.sleep = ((durationMs: number) => {
        sleepCalls.push(durationMs);
        onSleep?.(durationMs);

        return Promise.resolve();
    }) as typeof Bun.sleep;

    return {
        restore: () => {
            Bun.sleep = originalSleep;
        },
        sleepCalls,
    };
}

async function seedConnectorActionSchema(
    sandbox: {
        env: Record<string, string | undefined>;
    },
    action: SeedConnectorAction = createConnectorActionFixture(),
): Promise<void> {
    const cacheStore = new SqliteCacheStore(
        join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "data", "cache.sqlite"),
        pino({
            enabled: false,
        }),
    );

    try {
        await cacheConnectorActionSchemas(
            [action],
            {
                cacheAccountId: "user-1",
                cacheEndpoint: "oomol.com",
            },
            {
                cacheStore,
                logger: pino({
                    enabled: false,
                }),
                settingsStore: createSettingsStoreForSandbox(sandbox),
            },
        );
    }
    finally {
        cacheStore.close();
    }
}

function createSettingsStoreForSandbox(sandbox: {
    env: Record<string, string | undefined>;
}) {
    const emptySettings = {} as AppSettings;

    return {
        getFilePath: () => join(
            sandbox.env.XDG_CONFIG_HOME!,
            APP_NAME,
            "settings.toml",
        ),
        read: async () => emptySettings,
        update: async (updater: (settings: AppSettings) => AppSettings) =>
            updater(emptySettings),
        write: async (value: AppSettings) => value,
    };
}

// Collapses every run of whitespace (including the line wraps commander inserts
// into help output) into single spaces so assertions stay column-width agnostic.
function collapseWhitespace(value: string): string {
    return value
        .split("\n")
        .join(" ")
        .split(" ")
        .filter(Boolean)
        .join(" ");
}
