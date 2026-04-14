import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    createConnectorActionFixture,
    readLatestLogContent,
    toRequest,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { createTerminalColors } from "../../terminal-colors.ts";
import {
    renderConnectorActionSchemaCache,
    resolveConnectorActionSchemaPath,
} from "./schema-cache.ts";
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
            const schemaPath = resolveConnectorActionSchemaPath(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml"),
                "gmail",
                "send_mail",
            );

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("gmail.send_mail");
            expect(result.stdout).toContain("Send a Gmail message.");
            expect(result.stdout).toContain("Authenticated: yes");
            expect(result.stdout).toContain(`Schema path: ${schemaPath}`);
            expect(requests).toHaveLength(2);
            expect(requests[0]?.url).toBe(
                "https://search.oomol.com/v1/connector-actions?q=send+mail&keywords=gmail%2Cemail",
            );
            expect(requests[1]?.url).toBe(
                "https://connector.oomol.com/v1/apps/authenticated?service=gmail",
            );
            await expect(Bun.file(schemaPath).text()).resolves.toBe(
                [
                    "{",
                    "  \"description\": \"Send a Gmail message.\",",
                    "  \"inputSchema\": {",
                    "    \"properties\": {",
                    "      \"to\": {",
                    "        \"format\": \"email\",",
                    "        \"type\": \"string\"",
                    "      }",
                    "    },",
                    "    \"required\": [",
                    "      \"to\"",
                    "    ],",
                    "    \"type\": \"object\"",
                    "  },",
                    "  \"name\": \"send_mail\",",
                    "  \"outputSchema\": {",
                    "    \"properties\": {",
                    "      \"messageId\": {",
                    "        \"type\": \"string\"",
                    "      }",
                    "    },",
                    "    \"required\": [",
                    "      \"messageId\"",
                    "    ],",
                    "    \"type\": \"object\"",
                    "  },",
                    "  \"service\": \"gmail\"",
                    "}",
                    "",
                ].join("\n"),
            );
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
                    schemaPath: resolveConnectorActionSchemaPath(
                        join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml"),
                        "gmail",
                        "send_mail",
                    ),
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

    test("supports connector run with cached schema and json output", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const schemaPath = resolveConnectorActionSchemaPath(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml"),
                "gmail",
                "send_mail",
            );

            await Bun.write(
                schemaPath,
                renderConnectorActionSchemaCache({
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
                }),
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
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("trims connector action names before cache lookup and request", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);
            const schemaPath = await seedConnectorActionSchema(
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
            expect(schemaPath).toBe(
                resolveConnectorActionSchemaPath(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml"),
                    "gmail",
                    "send_mail",
                ),
            );
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

            const schemaPath = resolveConnectorActionSchemaPath(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml"),
                "gmail",
                "send_mail",
            );

            await Bun.write(
                schemaPath,
                renderConnectorActionSchemaCache({
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
                }),
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
            const schemaPath = resolveConnectorActionSchemaPath(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml"),
                "gmail",
                "send_mail",
            );

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
            expect(JSON.parse(result.stdout)).toEqual({
                dryRun: true,
                ok: true,
                schemaPath,
            });
            expect(requests).toHaveLength(1);
            expect(requests[0]?.url).toBe(
                "https://connector.oomol.com/v1/actions/gmail.send_mail",
            );
            await expect(Bun.file(schemaPath).text()).resolves.toContain(
                "\"service\": \"gmail\"",
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

            const schemaPath = resolveConnectorActionSchemaPath(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml"),
                "gmail",
                "send_mail",
            );

            await Bun.write(
                schemaPath,
                renderConnectorActionSchemaCache({
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
                }),
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

            const schemaPath = resolveConnectorActionSchemaPath(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml"),
                "gmail",
                "get_message",
            );

            await Bun.write(
                schemaPath,
                renderConnectorActionSchemaCache({
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
                }),
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
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

async function seedConnectorActionSchema(
    sandbox: {
        env: Record<string, string | undefined>;
    },
    action = createConnectorActionFixture(),
): Promise<string> {
    const schemaPath = resolveConnectorActionSchemaPath(
        join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "settings.toml"),
        action.service,
        action.name,
    );

    await Bun.write(schemaPath, renderConnectorActionSchemaCache(action));

    return schemaPath;
}
