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
    test("supports connector search with text output and writes schema caches", async () => {
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
                    fetcher: async () => {
                        throw new Error("Unexpected schema metadata request");
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
            });
            expect(requests).toHaveLength(2);
            expect(requests[0]?.url).toBe(
                "https://search.oomol.com/v1/connector-actions?q=send+mail&keywords=gmail%2Cemail",
            );
            expect(requests[1]?.url).toBe(
                "https://connector.oomol.com/v1/apps/authenticated?service=gmail",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("preserves async lifecycle from connector search cache before running", async () => {
        const sandbox = await createCliSandbox();
        const originalSleep = Bun.sleep;

        try {
            Bun.sleep = (() => Promise.resolve()) as typeof Bun.sleep;
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
                                        asyncLifecycle: {
                                            defaultRunMode: "wait",
                                            kind: "poll",
                                            poll: {
                                                action: "openai_image_async_result",
                                                handleInputField: "sessionID",
                                                handleOutputField: "sessionId",
                                                intervalSeconds: 3,
                                            },
                                            resultField: "data",
                                            state: {
                                                failure: ["not_found"],
                                                field: "state",
                                                running: ["processing"],
                                                success: ["completed"],
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
            expect(JSON.parse(result.stdout)).toEqual({
                data: {
                    images: ["image-1"],
                },
                meta: {
                    executionId: "poll-exec",
                    handle: "session-1",
                    pollAction: "openai_image_async_result",
                    pollCount: 1,
                    submitExecutionId: "submit-exec",
                },
            });
            expect(requests.map(request => request.url)).toEqual([
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_submit",
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_result",
            ]);
        }
        finally {
            Bun.sleep = originalSleep;
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

    test("renders connector schema help without json options", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["connector", "schema", "--help"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(result.stdout).not.toContain("--format");
            expect(result.stdout).not.toContain("--json");
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
                    service: "gmail",
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("data");
            expect(telemetryPayload?.properties).not.toHaveProperty("input");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("waits for async lifecycle completion when connector run defaults to wait", async () => {
        const sandbox = await createCliSandbox();
        const originalSleep = Bun.sleep;
        const sleepCalls: number[] = [];

        try {
            Bun.sleep = ((durationMs: number) => {
                sleepCalls.push(durationMs);

                return Promise.resolve();
            }) as typeof Bun.sleep;

            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                {
                    asyncLifecycle: {
                        defaultRunMode: "wait",
                        kind: "poll",
                        poll: {
                            action: "openai_image_async_result",
                            handleInputField: "sessionID",
                            handleOutputField: "sessionId",
                            intervalSeconds: 3,
                        },
                        resultField: "data",
                        state: {
                            failure: ["not_found"],
                            field: "state",
                            running: ["processing"],
                            success: ["completed"],
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
                },
            );

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
            expect(sleepCalls).toEqual([3_000]);
        }
        finally {
            Bun.sleep = originalSleep;
            await sandbox.cleanup();
        }
    });

    test("removes cached poll schema after async connector poll reports action_not_found", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            await seedConnectorActionSchema(
                sandbox,
                {
                    asyncLifecycle: {
                        defaultRunMode: "wait",
                        kind: "poll",
                        poll: {
                            action: "openai_image_async_result",
                            handleInputField: "sessionID",
                            handleOutputField: "sessionId",
                            intervalSeconds: 3,
                        },
                        resultField: "data",
                        state: {
                            failure: ["not_found"],
                            field: "state",
                            running: ["processing"],
                            success: ["completed"],
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
                    service: "fusion-api",
                },
            );
            await seedConnectorActionSchema(
                sandbox,
                {
                    description: "Cached poll schema.",
                    inputSchema: {
                        type: "object",
                    },
                    name: "openai_image_async_result",
                    outputSchema: {
                        type: "object",
                    },
                    service: "fusion-api",
                },
            );

            const runResult = await sandbox.run(
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
                            errorCode: "action_not_found",
                            success: false,
                        }), {
                            status: 404,
                        });
                    },
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
                                description: "Fresh poll schema.",
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
                "The connector action run request returned HTTP 404 (errorCode: action_not_found).",
            );
            expect(metadataRequestCount).toBe(1);
            expect(JSON.parse(schemaResult.stdout)).toMatchObject({
                description: "Fresh poll schema.",
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
            await seedConnectorActionSchema(
                sandbox,
                {
                    asyncLifecycle: {
                        defaultRunMode: "wait",
                        kind: "poll",
                        poll: {
                            action: "openai_image_async_result",
                            handleInputField: "sessionID",
                            handleOutputField: "sessionId",
                            intervalSeconds: 3,
                        },
                        resultField: "data",
                        state: {
                            failure: ["not_found"],
                            field: "state",
                            running: ["processing"],
                            success: ["completed"],
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
                    service: "fusion-api",
                },
            );

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
                                state: "completed",
                            },
                            meta: {
                                executionId: "poll-exec",
                            },
                        }));
                    },
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
                "The connector action run request returned HTTP 400 (errorCode: invalid_input): Invalid id value",
            );
            expect(content).toContain(
                "\"msg\":\"Connector action run request returned a non-success status.\"",
            );
            expect(content).toContain("\"responseMessage\":\"Invalid id value\"");
            expect(content).toContain("\"errorCode\":\"invalid_input\"");
            expect(content).toContain("\"executionId\":\"exec-1\"");
            expect(content).not.toContain("\"responseBody\":");
            expect(telemetryPayload).toMatchObject({
                properties: {
                    action: "get_message",
                    command_full: "connector.run",
                    data_size_bucket: "<1KB",
                    dry_run: false,
                    error_code: "invalid_input",
                    http_status: 400,
                    service: "gmail",
                },
            });
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
                ["connector", "schema", "gmail", "--action", "send_mail"],
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
                                        defaultRunMode: "wait",
                                        kind: "poll",
                                        poll: {
                                            action: "openai_image_async_result",
                                            handleInputField: "sessionID",
                                            handleOutputField: "sessionId",
                                            intervalSeconds: 3,
                                        },
                                        resultField: "data",
                                        state: {
                                            failure: ["not_found"],
                                            field: "state",
                                            running: ["processing"],
                                            success: ["completed"],
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

                        return new Response(JSON.stringify({
                            data: {
                                description: "Get OpenAI image generation result.",
                                inputSchema: {
                                    type: "object",
                                },
                                name: "openai_image_async_result",
                                outputSchema: {
                                    properties: {
                                        data: {
                                            properties: {
                                                images: {
                                                    items: {
                                                        type: "string",
                                                    },
                                                    type: "array",
                                                },
                                            },
                                            type: "object",
                                        },
                                        state: {
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
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toMatchObject({
                asyncLifecycle: {
                    defaultRunMode: "wait",
                    poll: {
                        action: "openai_image_async_result",
                    },
                    resultField: "data",
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
                runOutputSchema: {
                    properties: {
                        images: {
                            items: {
                                type: "string",
                            },
                            type: "array",
                        },
                    },
                    type: "object",
                },
                service: "fusion-api",
            });
            expect(requests.map(request => request.url)).toEqual([
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_submit",
                "https://connector.oomol.com/v1/actions/fusion-api.openai_image_async_result",
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
                "The connector action run request returned HTTP 404 (errorCode: action_not_found).",
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
});

type SeedConnectorAction = ConnectorActionDefinition & Partial<Pick<
    ConnectorActionMetadata,
    "asyncLifecycle" | "providerPermissions" | "requiredScopes"
>>;

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
