import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    readLatestLogContent,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { APP_NAME } from "../../config/app-config.ts";
import { readTelemetryRowsForTest } from "../../telemetry/outbox.ts";

describe("llm CLI", () => {
    test("prints current LLM client config as json", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["llm", "config", "--json"], {
                fetcher: async () => {
                    throw new Error("llm config should not make network requests");
                },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const config = JSON.parse(result.stdout) as {
                apiKey: string;
                baseUrl: string;
                chatCompletionsUrl: string;
                model: string;
            };

            expect(config).toEqual({
                apiKey: "secret-1",
                baseUrl: "https://llm.oomol.com/v1",
                chatCompletionsUrl: "https://llm.oomol.com/v1/chat/completions",
                model: "oomol-chat",
            });
            expect(config.baseUrl).not.toBe("https://llm.oomol.com/");
            expect(config.chatCompletionsUrl).not.toBe(
                "https://llm.oomol.com/chat/completions",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("derives the LLM base URL from the active account endpoint", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox, {
                accounts: [
                    {
                        apiKey: "secret-2",
                        endpoint: "staging.oomol.test",
                        id: "user-2",
                        name: "Bob",
                    },
                ],
            });

            const jsonAliasResult = await sandbox.run(["llm", "config", "--json"]);
            const jsonFormatResult = await sandbox.run([
                "llm",
                "config",
                "--format=json",
            ]);

            expect(JSON.parse(jsonAliasResult.stdout)).toEqual({
                apiKey: "secret-2",
                baseUrl: "https://llm.staging.oomol.test/v1",
                chatCompletionsUrl: "https://llm.staging.oomol.test/v1/chat/completions",
                model: "oomol-chat",
            });
            expect(JSON.parse(jsonFormatResult.stdout)).toEqual({
                apiKey: "secret-2",
                baseUrl: "https://llm.staging.oomol.test/v1",
                chatCompletionsUrl: "https://llm.staging.oomol.test/v1/chat/completions",
                model: "oomol-chat",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not log or emit telemetry when printing LLM config", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["llm", "config", "--json"]);
            const content = await readLatestLogContent(sandbox);

            expect(result.exitCode).toBe(0);
            expect(content).not.toContain("secret-1");
            expect(readTelemetryRowsForTest(
                join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
            )).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("requires login before printing LLM config", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["llm", "config", "--json"]);

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 1,
                stderr: "You must log in before using this command.\n",
                stdout: "",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("validates the LLM config format option", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run(["llm", "config", "--format=yaml"]);

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 2,
                stderr: "Invalid format: yaml. Use json.\n",
                stdout: "",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("generates structured JSON and validates it against a schema", async () => {
        const sandbox = await createCliSandbox();
        const schema = createTranslationSchema();

        try {
            await writeAuthFile(sandbox);
            await Bun.write(
                join(sandbox.cwd, "schema.json"),
                JSON.stringify(schema),
            );
            await Bun.write(
                join(sandbox.cwd, "input.json"),
                JSON.stringify({
                    items: [
                        {
                            index: 1,
                            text: "hello",
                        },
                    ],
                }),
            );
            await Bun.write(
                join(sandbox.cwd, "system.txt"),
                "Translate each item.",
            );

            const result = await sandbox.run([
                "llm",
                "json",
                "--schema",
                "@schema.json",
                "--input",
                "@input.json",
                "--system",
                "@system.txt",
                "--json",
            ], {
                fetcher: async (input, init) => {
                    const request = createRequest(input, init);
                    const body = await request.json() as {
                        messages: { content: string; role: string }[];
                        model: string;
                        response_format: { type: string };
                        temperature: number;
                    };

                    expect(request.method).toBe("POST");
                    expect(request.url).toBe(
                        "https://llm.oomol.com/v1/chat/completions",
                    );
                    expect(request.url).not.toBe(
                        "https://llm.oomol.com/chat/completions",
                    );
                    expect(request.headers.get("Authorization")).toBe(
                        "Bearer secret-1",
                    );
                    expect(body.model).toBe("oomol-chat");
                    expect(body.response_format).toEqual({ type: "json_object" });
                    expect(body.temperature).toBe(0);
                    expect(body.messages[0]).toEqual({
                        content: "Return only valid JSON. Do not wrap the response in Markdown. The JSON value must satisfy the provided JSON Schema.\n\nTranslate each item.",
                        role: "system",
                    });
                    expect(body.messages[1]!.content).toContain("Input JSON:");
                    expect(body.messages[1]!.content).toContain("Response JSON Schema:");

                    return createChatCompletionResponse(
                        "```json\n{\"items\":[{\"index\":1,\"text\":\"你好\"}]}\n```",
                    );
                },
            });

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(JSON.parse(result.stdout)).toEqual({
                attempts: 1,
                data: {
                    items: [
                        {
                            index: 1,
                            text: "你好",
                        },
                    ],
                },
                model: "oomol-chat",
                ok: true,
            });
            expect(await readLatestLogContent(sandbox)).not.toContain("secret-1");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("retries malformed structured JSON responses", async () => {
        const sandbox = await createCliSandbox();
        let requestCount = 0;

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run([
                "llm",
                "json",
                "--schema",
                JSON.stringify(createTranslationSchema()),
                "--input",
                JSON.stringify({ items: [{ index: 1, text: "hello" }] }),
                "--max-retries",
                "1",
            ], {
                fetcher: async (input, init) => {
                    const request = createRequest(input, init);
                    const body = await request.json() as {
                        messages: { content: string }[];
                    };

                    requestCount += 1;

                    if (requestCount === 1) {
                        return createChatCompletionResponse("not json");
                    }

                    expect(body.messages[1]!.content).toContain(
                        "The previous response was invalid:",
                    );

                    return createChatCompletionResponse(
                        "{\"items\":[{\"index\":1,\"text\":\"你好\"}]}",
                    );
                },
            });

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                attempts: 2,
                data: {
                    items: [
                        {
                            index: 1,
                            text: "你好",
                        },
                    ],
                },
                model: "oomol-chat",
                ok: true,
            });
            expect(requestCount).toBe(2);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("rejects non-object root response schemas before sending a request", async () => {
        const sandbox = await createCliSandbox();
        let requestCount = 0;

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run([
                "llm",
                "json",
                "--schema",
                JSON.stringify({ items: { type: "string" }, type: "array" }),
            ], {
                fetcher: async () => {
                    requestCount += 1;
                    return createChatCompletionResponse("[]");
                },
            });

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 2,
                stderr: "The response JSON Schema root type must be object for this endpoint.\n",
                stdout: "",
            });
            expect(requestCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails after schema validation retries are exhausted", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run([
                "llm",
                "json",
                "--schema",
                JSON.stringify(createTranslationSchema()),
                "--max-retries",
                "0",
            ], {
                fetcher: async () => createChatCompletionResponse("{}"),
            });

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 1,
                stderr: "The LLM did not return valid JSON matching the schema after retries: data must have required property items\n",
                stdout: "",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("classifies missing LLM endpoint errors", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run([
                "llm",
                "json",
                "--schema",
                JSON.stringify(createTranslationSchema()),
            ], {
                fetcher: async () => new Response("<html>not found</html>", {
                    status: 404,
                }),
            });

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 1,
                stderr: "The LLM chat completions endpoint returned HTTP 404. Use the normalized endpoint from oo llm config.\n",
                stdout: "",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("classifies rejected LLM credentials", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run([
                "llm",
                "json",
                "--schema",
                JSON.stringify(createTranslationSchema()),
            ], {
                fetcher: async () => new Response("unauthorized", {
                    status: 401,
                }),
            });

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 1,
                stderr: "The LLM request returned HTTP 401. Check the current account credentials.\n",
                stdout: "",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("classifies rate-limited LLM requests", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const result = await sandbox.run([
                "llm",
                "json",
                "--schema",
                JSON.stringify(createTranslationSchema()),
            ], {
                fetcher: async () => new Response("slow down", {
                    status: 429,
                }),
            });

            expect(createCliSnapshot(result)).toEqual({
                exitCode: 1,
                stderr: "The LLM request returned HTTP 429. Retry later or reduce request frequency.\n",
                stdout: "",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("validates required LLM JSON options", async () => {
        const sandbox = await createCliSandbox();

        try {
            await writeAuthFile(sandbox);

            const missingSchemaResult = await sandbox.run(["llm", "json"]);
            const invalidRetriesResult = await sandbox.run([
                "llm",
                "json",
                "--schema",
                JSON.stringify(createTranslationSchema()),
                "--max-retries",
                "6",
            ]);

            expect(createCliSnapshot(missingSchemaResult)).toEqual({
                exitCode: 2,
                stderr: "The --schema option is required.\n",
                stdout: "",
            });
            expect(createCliSnapshot(invalidRetriesResult)).toEqual({
                exitCode: 2,
                stderr: "Invalid value for --max-retries: 6. Use an integer between 0 and 5.\n",
                stdout: "",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("derives the LLM config from OO_API_KEY and OO_ENDPOINT without login", async () => {
        const sandbox = await createCliSandbox();

        // No writeAuthFile: drive auth and endpoint purely from env.
        sandbox.env.OO_API_KEY = "env-key";
        sandbox.env.OO_ENDPOINT = "oomol.dev";

        try {
            const result = await sandbox.run(["llm", "config", "--json"], {
                fetcher: () => {
                    throw new Error("llm config should not make network requests");
                },
            });

            expect(result.exitCode).toBe(0);
            const config = JSON.parse(result.stdout) as {
                apiKey: string;
                baseUrl: string;
                chatCompletionsUrl: string;
                model: string;
            };

            expect(config).toEqual({
                apiKey: "env-key",
                baseUrl: "https://llm.oomol.dev/v1",
                chatCompletionsUrl: "https://llm.oomol.dev/v1/chat/completions",
                model: "oomol-chat",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

function createChatCompletionResponse(content: string): Response {
    return new Response(JSON.stringify({
        choices: [
            {
                message: {
                    content,
                },
            },
        ],
    }));
}

function createRequest(
    input: string | URL | Request,
    init: RequestInit | undefined,
): Request {
    if (input instanceof Request) {
        return new Request(input, init);
    }

    return new Request(input.toString(), init);
}

function createTranslationSchema(): Record<string, unknown> {
    return {
        properties: {
            items: {
                items: {
                    properties: {
                        index: {
                            type: "integer",
                        },
                        text: {
                            minLength: 1,
                            type: "string",
                        },
                    },
                    required: ["index", "text"],
                    type: "object",
                },
                type: "array",
            },
        },
        required: ["items"],
        type: "object",
    };
}
