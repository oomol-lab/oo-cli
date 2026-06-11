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
    test("supports connector search with text output without caching partial schemas", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["connector", "search", "send mail", "--keywords=gmail,email,gmail"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.startsWith("https://search.")) {
                            return new Response(JSON.stringify({
                                data: [
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
                                ],
                            }));
                        }

                        return new Response(JSON.stringify({
                            data: ["gmail"],
                        }));
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
            expect(requests).toHaveLength(3);
            expect(requests[0]?.url).toBe(
                "https://search.oomol.com/v1/connector-actions?q=send+mail&keywords=gmail%2Cemail",
            );
            expect(requests[1]?.url).toBe(
                "https://connector.oomol.com/v1/apps/authenticated?service=gmail",
            );
            expect(requests[2]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
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

                        if (request.url.startsWith("https://search.")) {
                            return new Response(JSON.stringify({
                                data: [
                                    {
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
                                        service: "fusion-api",
                                    },
                                ],
                            }));
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

                        if (request.url.startsWith("https://search.")) {
                            return new Response(JSON.stringify({
                                data: [
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
                                ],
                            }));
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

                        if (request.url.startsWith("https://search.")) {
                            return new Response(JSON.stringify({
                                data: [
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
                                ],
                            }));
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
            expect(result.stdout).toContain("--organization");
            expect(result.stdout).toContain("--org ");
            expect(result.stdout).toContain("--personal");
            expect(help).toContain(
                "Run the action under the given organization identity",
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
            expect(result.stdout).toContain("--organization");
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

    test("supports connector proxy with split request options and organization identity", async () => {
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
                    "--organization",
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
            expect(requests[0]?.headers.get("x-oo-organization")).toBe("acme");
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
            expect(telemetryPayload?.properties).not.toHaveProperty("organization");
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

    test("rejects --wait on regular connector actions", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createConnectorActionFixture());

            let requestCount = 0;
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

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain(
                "The --wait option is only supported for connector actions with an async result lifecycle.",
            );
            expect(requestCount).toBe(0);
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

    test("rejects --wait-result on regular connector actions before sending requests", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createConnectorActionFixture());

            let requestCount = 0;
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
                    data_size_bucket: "<1KB",
                    dry_run: false,
                    error_code: "invalid_input",
                    http_status: 400,
                    service: "gmail",
                    wait: false,
                },
            });
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
            expect(result.stderr).toContain(
                "Connector action openai_image_async_result returned HTTP 500.",
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
            expect(result.stderr).toContain(
                "Connector action send_mail returned HTTP 500.",
            );
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
            expect(result.stderr).toContain(
                "Connector action send_mail returned HTTP 500.",
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

    test("runs a connector action under an organization identity from --organization", async () => {
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
                    "--organization",
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
            expect(requests[0]?.headers.get("x-oo-organization")).toBe("acme");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "connector.run",
                    identity_source: "flag",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("organization");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("accepts the --org alias and keeps the action schema request identity-free", async () => {
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
                    "--org",
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
            expect(requests[0]?.headers.get("x-oo-organization")).toBeNull();
            // The run POST carries the organization identity.
            expect(requests[1]?.method).toBe("POST");
            expect(requests[1]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
            expect(requests[1]?.headers.get("x-oo-organization")).toBe("acme");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uses the configured default organization when no identity flag is provided", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createConnectorActionFixture());
            await sandbox.run(["config", "set", "identity.organization", "acme"]);

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
            expect(requests[0]?.headers.get("x-oo-organization")).toBe("acme");
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

    test("forces the personal identity with --personal even when a default organization is configured", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(sandbox, createConnectorActionFixture());
            await sandbox.run(["config", "set", "identity.organization", "acme"]);

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
            expect(requests[0]?.headers.get("x-oo-organization")).toBeNull();
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

    test("rejects an empty --organization value before sending requests", async () => {
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
                    "--organization",
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
                "The --organization value cannot be empty.",
            );
            expect(requestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects combining --organization and --personal before sending requests", async () => {
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
                    "--organization",
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
                "Use either --organization or --personal, not both.",
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
                "https://search.oomol.dev/v1/connector-actions",
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
                "https://search.oomol.dev/v1/connector-actions",
            );
            // The persisted API key is still used as the credential.
            expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
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
                endpoint: "oomol.com",
                id: "user-1",
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
