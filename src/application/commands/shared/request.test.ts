import { describe, expect, test } from "bun:test";

import {
    createConnectionRefusedError,
    createFailedToOpenSocketError,
    createLogCapture,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { executeCliRequest } from "./request.ts";

describe("executeCliRequest", () => {
    test("logs request lifecycle and returns the response", async () => {
        const logCapture = createLogCapture();
        const requestUrl = new URL("https://example.com/items/1");

        try {
            const response = await executeCliRequest({
                context: {
                    fetcher: async () => new Response("ok", {
                        status: 200,
                    }),
                    logger: logCapture.logger,
                    translator: createTranslator("en"),
                },
                createRequestError: error => new CliUserError(
                    "errors.shared.requestError",
                    1,
                    {
                        message: error instanceof Error ? error.message : String(error),
                    },
                ),
                createRequestFailedError: status => new CliUserError(
                    "errors.shared.requestFailed",
                    1,
                    {
                        status,
                    },
                ),
                includeMethod: true,
                label: "Shared",
                requestUrl,
                startLogFields: {
                    traceId: "trace-1",
                },
            });

            expect(response.status).toBe(200);
            const logs = logCapture.read();

            expect(logs).toContain("\"msg\":\"Shared request started.\"");
            expect(logs).toContain("\"msg\":\"Shared request completed.\"");
            expect(logs).toContain("\"traceId\":\"trace-1\"");
        }
        finally {
            logCapture.close();
        }
    });

    test("accepts configured non-success status codes", async () => {
        const logCapture = createLogCapture();

        try {
            const response = await executeCliRequest({
                allowedStatusCodes: [416],
                context: {
                    fetcher: async () => new Response(null, {
                        status: 416,
                    }),
                    logger: logCapture.logger,
                    translator: createTranslator("en"),
                },
                createRequestError: error => new CliUserError(
                    "errors.shared.requestError",
                    1,
                    {
                        message: error instanceof Error ? error.message : String(error),
                    },
                ),
                createRequestFailedError: status => new CliUserError(
                    "errors.shared.requestFailed",
                    1,
                    {
                        status,
                    },
                ),
                label: "Shared",
                requestUrl: new URL("https://example.com/items/1"),
            });

            expect(response.status).toBe(416);
        }
        finally {
            logCapture.close();
        }
    });

    test("wraps non-success statuses with the caller-provided error", async () => {
        const logCapture = createLogCapture();

        try {
            await expect(executeCliRequest({
                context: {
                    fetcher: async () => new Response("missing", {
                        status: 404,
                    }),
                    logger: logCapture.logger,
                    translator: createTranslator("en"),
                },
                createRequestError: error => new CliUserError(
                    "errors.shared.requestError",
                    1,
                    {
                        message: error instanceof Error ? error.message : String(error),
                    },
                ),
                createRequestFailedError: status => new CliUserError(
                    "errors.shared.requestFailed",
                    1,
                    {
                        status,
                    },
                ),
                label: "Shared",
                requestUrl: new URL("https://example.com/items/1"),
            })).rejects.toMatchObject({
                key: "errors.shared.requestFailed",
                params: {
                    status: 404,
                },
            });
        }
        finally {
            logCapture.close();
        }
    });

    test("wraps unexpected fetcher errors with the caller-provided error", async () => {
        const logCapture = createLogCapture();

        try {
            await expect(executeCliRequest({
                context: {
                    fetcher: async () => {
                        throw new Error("network down");
                    },
                    logger: logCapture.logger,
                    translator: createTranslator("en"),
                },
                createRequestError: error => new CliUserError(
                    "errors.shared.requestError",
                    1,
                    {
                        message: error instanceof Error ? error.message : String(error),
                    },
                ),
                createRequestFailedError: status => new CliUserError(
                    "errors.shared.requestFailed",
                    1,
                    {
                        status,
                    },
                ),
                label: "Shared",
                requestUrl: new URL("https://example.com/items/1"),
            })).rejects.toMatchObject({
                key: "errors.shared.requestError",
                params: {
                    message: "network down",
                },
            });

            expect(logCapture.read()).toContain(
                "\"msg\":\"Shared request failed unexpectedly.\"",
            );
        }
        finally {
            logCapture.close();
        }
    });

    test("adds a sandbox network hint when the fetcher cannot open a socket", async () => {
        const logCapture = createLogCapture();

        try {
            await expect(executeCliRequest({
                context: {
                    fetcher: async () => {
                        throw createFailedToOpenSocketError("network down");
                    },
                    logger: logCapture.logger,
                    translator: createTranslator("zh"),
                },
                createRequestError: error => new CliUserError(
                    "errors.shared.requestError",
                    1,
                    {
                        message: error instanceof Error ? error.message : String(error),
                    },
                ),
                createRequestFailedError: status => new CliUserError(
                    "errors.shared.requestFailed",
                    1,
                    {
                        status,
                    },
                ),
                label: "Shared",
                requestUrl: new URL("https://example.com/items/1"),
            })).rejects.toMatchObject({
                key: "errors.shared.requestError",
                params: {
                    message:
                        "network down\n当前环境可能在网络受限的沙箱中，请尝试提权。",
                },
            });
        }
        finally {
            logCapture.close();
        }
    });

    test("adds a sandbox network hint when the fetcher connection is refused", async () => {
        const logCapture = createLogCapture();

        try {
            await expect(executeCliRequest({
                context: {
                    fetcher: async () => {
                        throw createConnectionRefusedError("connection refused");
                    },
                    logger: logCapture.logger,
                    translator: createTranslator("zh"),
                },
                createRequestError: error => new CliUserError(
                    "errors.shared.requestError",
                    1,
                    {
                        message: error instanceof Error ? error.message : String(error),
                    },
                ),
                createRequestFailedError: status => new CliUserError(
                    "errors.shared.requestFailed",
                    1,
                    {
                        status,
                    },
                ),
                label: "Shared",
                requestUrl: new URL("https://example.com/items/1"),
            })).rejects.toMatchObject({
                key: "errors.shared.requestError",
                params: {
                    message:
                        "connection refused\n当前环境可能在网络受限的沙箱中，请尝试提权。",
                },
            });
        }
        finally {
            logCapture.close();
        }
    });
});
