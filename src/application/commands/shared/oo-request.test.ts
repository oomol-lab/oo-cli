import { describe, expect, test } from "bun:test";
import { z } from "zod";

import {
    createConnectionRefusedError,
    createFailedToOpenSocketError,
    createLogCapture,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { billingUrl } from "./billing.ts";
import {
    isNetworkRestrictedSandboxError,
    probeOo,
    requestOo,
    requestOoResponse,
} from "./oo-request.ts";

const itemSchema = z.object({ name: z.string() });

describe("requestOo", () => {
    test.each([
        {
            expectedUrl: "https://relation-control.oomol.com/v1/me/teams",
            host: { endpoint: "oomol.com", service: "relation-control" } as const,
            path: "/v1/me/teams",
            title: "service host",
        },
        {
            expectedUrl: "https://fusion-api.oomol.com/v1/file-upload/action/create-multipart-upload",
            host: { endpoint: "oomol.com", service: "fusion-api" } as const,
            path: "/v1/file-upload/action/create-multipart-upload",
            title: "second service host",
        },
        {
            expectedUrl: "http://localhost:3000/prefix/v1/actions",
            host: { baseUrl: "http://localhost:3000/prefix" },
            path: "/v1/actions",
            title: "base URL keeps a self-hosted path prefix",
        },
        {
            expectedUrl: "https://cli-api.oomol.com/v1/variables/a%2Fb%20c",
            host: { endpoint: "oomol.com", service: "cli-api" } as const,
            path: `/v1/variables/${encodeURIComponent("a/b c")}`,
            title: "pre-encoded path segment",
        },
    ])("builds the request URL from a $title", async ({ expectedUrl, host, path }) => {
        await withRequestCapture(async (capture) => {
            const result = await requestOo({
                context: capture.context,
                errors: { scope: "team" },
                host,
                label: "Team list",
                path,
                schema: itemSchema,
            });

            expect(result).toEqual({ name: "a" });
            expect(capture.requests[0]?.url).toBe(expectedUrl);
        });
    });

    test("appends query params including repeated array keys in order", async () => {
        await withRequestCapture(async (capture) => {
            await requestOo({
                context: capture.context,
                errors: { scope: "skillsSearch" },
                host: { endpoint: "oomol.com", service: "search" },
                label: "Skills search",
                path: "/v1/packages/-/skills-search",
                query: {
                    keywords: ["bar", "baz"],
                    size: "10",
                    text: "send mail",
                },
                schema: itemSchema,
            });

            const url = new URL(capture.requests[0]?.url ?? "");

            expect(url.searchParams.getAll("keywords")).toEqual(["bar", "baz"]);
            expect(url.searchParams.get("size")).toBe("10");
            expect(url.search).toContain("text=send+mail");
        });
    });

    test("preserves a query embedded in a full-URL host with no path", async () => {
        await withRequestCapture(async (capture) => {
            await requestOo({
                context: capture.context,
                errors: { scope: "team" },
                host: { baseUrl: "https://example.com/files/report.txt?download=1" },
                label: "Team list",
                schema: itemSchema,
            });

            expect(capture.requests[0]?.url).toBe(
                "https://example.com/files/report.txt?download=1",
            );
        });
    });

    test("sends no Authorization header when authorization is absent", async () => {
        await withRequestCapture(async (capture) => {
            await requestOo({
                context: capture.context,
                errors: { scope: "packageInfo" },
                host: { endpoint: "oomol.com", service: "registry" },
                label: "Package info",
                path: "/-/oomol/package-info/a/latest",
                schema: itemSchema,
            });

            expect(capture.requests[0]?.headers).toEqual({});
        });
    });

    test("sends the authorization value verbatim and merges extras over defaults", async () => {
        await withRequestCapture(async (capture) => {
            await requestOo({
                authorization: "Bearer token-1",
                context: capture.context,
                errors: { scope: "llmJson" },
                headers: { Accept: "application/json" },
                host: { baseUrl: "https://llm.oomol.com/v1" },
                jsonBody: { messages: [] },
                label: "LLM chat completions",
                method: "POST",
                path: "/chat/completions",
                schema: itemSchema,
            });

            const request = capture.requests[0];

            expect(request?.headers).toEqual({
                "Accept": "application/json",
                "Authorization": "Bearer token-1",
                "Content-Type": "application/json",
            });
            expect(request?.method).toBe("POST");
            expect(request?.body).toBe(JSON.stringify({ messages: [] }));
        });
    });

    test.each([
        { body: "not json", title: "non-JSON body" },
        { body: JSON.stringify({ name: 42 }), title: "schema mismatch" },
    ])("maps a $title to the scope invalidResponse error", async ({ body }) => {
        await withRequestCapture(async (capture) => {
            capture.respondWith(new Response(body, { status: 200 }));

            await expect(requestOo({
                context: capture.context,
                errors: { scope: "variables" },
                host: { endpoint: "oomol.com", service: "cli-api" },
                label: "Variables list",
                path: "/v1/variables",
                schema: itemSchema,
            })).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.variables.invalidResponse",
            });
        });
    });

    test.each([
        {
            expectedKey: "errors.skills.install.invalidPackageInfo",
            response: () => new Response("nope", { status: 200 }),
            title: "decode failure",
        },
        {
            expectedKey: "errors.skills.install.packageInfoRequestFailed",
            response: () => new Response("missing", { status: 404 }),
            title: "non-success status",
        },
        {
            expectedKey: "errors.skills.install.packageInfoRequestError",
            response: () => {
                throw new Error("network down");
            },
            title: "transport failure",
        },
    ])("uses explicit error keys for an irregular-namespace $title", async ({ expectedKey, response }) => {
        await withRequestCapture(async (capture) => {
            await expect(requestOo({
                context: {
                    ...capture.context,
                    fetcher: async () => response(),
                },
                errors: {
                    invalidResponse: "errors.skills.install.invalidPackageInfo",
                    requestError: "errors.skills.install.packageInfoRequestError",
                    requestFailed: "errors.skills.install.packageInfoRequestFailed",
                },
                host: { endpoint: "oomol.com", service: "registry" },
                label: "Skills install package info",
                path: "/-/oomol/package-info/a/latest",
                schema: itemSchema,
            })).rejects.toMatchObject({
                key: expectedKey,
            });
        });
    });

    test("maps a non-success status to the scope requestFailed error", async () => {
        await withRequestCapture(async (capture) => {
            capture.respondWith(new Response("missing", { status: 404 }));

            await expect(requestOo({
                context: capture.context,
                errors: { scope: "team" },
                host: { endpoint: "oomol.com", service: "relation-control" },
                label: "Team list",
                path: "/v1/me/teams",
                schema: itemSchema,
            })).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.team.requestFailed",
                params: { status: 404 },
            });
        });
    });

    test("prefers a statusErrors match and falls through on undefined", async () => {
        await withRequestCapture(async (capture) => {
            capture.respondWith(new Response("gone", { status: 404 }));

            const request = () => requestOo({
                context: capture.context,
                errors: { scope: "variables" },
                host: { endpoint: "oomol.com", service: "cli-api" },
                label: "Variables get",
                path: "/v1/variables/k",
                schema: itemSchema,
                statusErrors: failure => failure.status === 404
                    ? new CliUserError("errors.variables.notFound", 1, { name: "k" })
                    : undefined,
            });

            await expect(request()).rejects.toMatchObject({
                key: "errors.variables.notFound",
                params: { name: "k" },
            });

            capture.respondWith(new Response("boom", { status: 500 }));
            await expect(request()).rejects.toMatchObject({
                key: "errors.variables.requestFailed",
                params: { status: 500 },
            });
        });
    });

    test("passes the failure body to statusErrors and the nonSuccess log resolver", async () => {
        await withRequestCapture(async (capture) => {
            capture.respondWith(new Response("{\"errorCode\":\"bad\"}", { status: 422 }));
            let seenBodyText: string | undefined;

            await expect(requestOo({
                context: capture.context,
                errors: { scope: "connectorRun" },
                host: { baseUrl: "https://connector.oomol.com" },
                label: "Connector action run",
                logFields: {
                    nonSuccess: failure => ({
                        responseBodyLength: failure.bodyText?.length,
                    }),
                },
                path: "/v1/actions/a.b",
                schema: itemSchema,
                statusErrors: (failure) => {
                    seenBodyText = failure.bodyText;

                    return new CliUserError("errors.connectorRun.requestFailedWithCode", 1, {
                        errorCode: "bad",
                        status: failure.status,
                    });
                },
            })).rejects.toMatchObject({
                key: "errors.connectorRun.requestFailedWithCode",
            });

            expect(seenBodyText).toBe("{\"errorCode\":\"bad\"}");
            expect(capture.logs()).toContain("\"responseBodyLength\":19");
        });
    });

    test("hands statusErrors an undefined body when the failure body is unreadable", async () => {
        await withRequestCapture(async (capture) => {
            capture.respondWith(new Response(createBrokenBodyStream(), { status: 500 }));
            let seenBodyText: string | undefined = "sentinel";

            await expect(requestOo({
                context: capture.context,
                errors: { scope: "team" },
                host: { endpoint: "oomol.com", service: "relation-control" },
                label: "Team list",
                path: "/v1/me/teams",
                schema: itemSchema,
                statusErrors: (failure) => {
                    seenBodyText = failure.bodyText;

                    return undefined;
                },
            })).rejects.toMatchObject({
                key: "errors.team.requestFailed",
            });

            expect(seenBodyText).toBeUndefined();
        });
    });

    test("maps HTTP 402 to the billing error before statusErrors runs", async () => {
        await withRequestCapture(async (capture) => {
            capture.respondWith(new Response("payment required", { status: 402 }));
            let statusErrorsCalled = false;

            await expect(requestOo({
                context: capture.context,
                errors: { scope: "variables" },
                host: { endpoint: "oomol.com", service: "cli-api" },
                label: "Variables list",
                path: "/v1/variables",
                schema: itemSchema,
                statusErrors: () => {
                    statusErrorsCalled = true;

                    return undefined;
                },
            })).rejects.toMatchObject({
                key: "errors.billing.insufficientCredit",
                params: { url: billingUrl },
            });

            expect(statusErrorsCalled).toBeFalse();
        });
    });

    test("maps a transport error to the scope requestError error", async () => {
        await withRequestCapture(async (capture) => {
            capture.failWith(new Error("network down"));

            await expect(requestOo({
                context: capture.context,
                errors: { scope: "team" },
                host: { endpoint: "oomol.com", service: "relation-control" },
                label: "Team list",
                path: "/v1/me/teams",
                schema: itemSchema,
            })).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.team.requestError",
                params: { message: "network down" },
            });

            expect(capture.logs()).toContain(
                "\"msg\":\"Team list request failed unexpectedly.\"",
            );
        });
    });

    test.each([
        { createError: createFailedToOpenSocketError, title: "socket" },
        { createError: createConnectionRefusedError, title: "connection-refused" },
    ])("appends the sandbox hint exactly once on a $title error", async ({ createError }) => {
        await withRequestCapture(async (capture) => {
            capture.failWith(createError("network down"));

            await expect(requestOo({
                context: capture.context,
                errors: { scope: "team" },
                host: { endpoint: "oomol.com", service: "relation-control" },
                label: "Team list",
                path: "/v1/me/teams",
                schema: itemSchema,
            })).rejects.toMatchObject({
                key: "errors.team.requestError",
                params: {
                    message: "network down\nCurrent environment may be running in a "
                        + "network-restricted sandbox. Try requesting elevated permissions.",
                },
            });
        });
    });

    test("appends the localized sandbox hint under the zh translator", async () => {
        await withRequestCapture(async (capture) => {
            capture.failWith(createFailedToOpenSocketError("network down"));

            await expect(requestOo({
                context: { ...capture.context, translator: createTranslator("zh") },
                errors: { scope: "team" },
                host: { endpoint: "oomol.com", service: "relation-control" },
                label: "Team list",
                path: "/v1/me/teams",
                schema: itemSchema,
            })).rejects.toMatchObject({
                params: {
                    message: "network down\n当前环境可能在网络受限的沙箱中，请尝试提权。",
                },
            });
        });
    });

    test("lets unexpectedMessage override the transport message on a still-classifiable error", async () => {
        await withRequestCapture(async (capture) => {
            capture.failWith(createConnectionRefusedError("refused"));
            let sandboxClassifiable = false;

            await expect(requestOo({
                context: capture.context,
                errors: { scope: "connectorApps" },
                host: { baseUrl: "http://localhost:3000" },
                label: "Connector apps list",
                path: "/v1/apps",
                schema: itemSchema,
                unexpectedMessage: (error) => {
                    sandboxClassifiable = isNetworkRestrictedSandboxError(error);

                    return "self-hosted server unreachable";
                },
            })).rejects.toMatchObject({
                key: "errors.connectorApps.requestError",
                params: { message: "self-hosted server unreachable" },
            });

            expect(sandboxClassifiable).toBeTrue();
        });
    });

    test("falls back to the hinted message when unexpectedMessage returns undefined", async () => {
        await withRequestCapture(async (capture) => {
            capture.failWith(createFailedToOpenSocketError("network down"));

            await expect(requestOo({
                context: capture.context,
                errors: { scope: "connectorApps" },
                host: { baseUrl: "https://connector.oomol.com" },
                label: "Connector apps list",
                path: "/v1/apps",
                schema: itemSchema,
                unexpectedMessage: () => undefined,
            })).rejects.toMatchObject({
                params: {
                    message: "network down\nCurrent environment may be running in a "
                        + "network-restricted sandbox. Try requesting elevated permissions.",
                },
            });
        });
    });

    test("maps a body read failure on a success response to requestError", async () => {
        await withRequestCapture(async (capture) => {
            capture.respondWith(new Response(createBrokenBodyStream(), { status: 200 }));

            await expect(requestOo({
                context: capture.context,
                errors: { scope: "team" },
                host: { endpoint: "oomol.com", service: "relation-control" },
                label: "Team list",
                path: "/v1/me/teams",
                schema: itemSchema,
            })).rejects.toMatchObject({
                key: "errors.team.requestError",
            });
        });
    });

    test("logs lifecycle fields including method, bodyLength, and durationMs", async () => {
        await withRequestCapture(async (capture) => {
            await requestOo({
                context: capture.context,
                errors: { scope: "variables" },
                host: { endpoint: "oomol.com", service: "cli-api" },
                jsonBody: { value: "v" },
                label: "Variables create",
                logFields: {
                    common: { name: "k" },
                    start: { traceId: "trace-1" },
                    success: response => ({ finalStatus: response.status }),
                },
                method: "PUT",
                path: "/v1/variables/k",
                schema: itemSchema,
            });

            const logs = capture.logs();

            expect(logs).toContain("\"msg\":\"Variables create request started.\"");
            expect(logs).toContain("\"msg\":\"Variables create request completed.\"");
            expect(logs).toContain("\"method\":\"PUT\"");
            expect(logs).toContain(`"bodyLength":${JSON.stringify({ value: "v" }).length}`);
            expect(logs).toContain("\"traceId\":\"trace-1\"");
            expect(logs).toContain("\"finalStatus\":200");
            expect(logs).toContain("\"name\":\"k\"");
            expect(logs).toContain("\"durationMs\":");
            expect(logs).toContain("\"endpoint\":\"cli-api.oomol.com\"");
            expect(logs).toContain("\"path\":\"/v1/variables/k\"");
        });
    });
});

describe("requestOoResponse", () => {
    test("returns the response with its body unconsumed", async () => {
        await withRequestCapture(async (capture) => {
            capture.respondWith(new Response("raw bytes", { status: 200 }));

            const response = await requestOoResponse({
                context: capture.context,
                errors: { scope: "fileDownload" },
                host: { baseUrl: "https://example.com/files/report.txt" },
                label: "File download",
            });

            expect(response.status).toBe(200);
            expect(await response.text()).toBe("raw bytes");
        });
    });

    test("lets an allowed status bypass failure handling with a readable body", async () => {
        await withRequestCapture(async (capture) => {
            capture.respondWith(new Response("range start", { status: 416 }));
            let statusErrorsCalled = false;

            const response = await requestOoResponse({
                allowedStatuses: [416],
                context: capture.context,
                errors: { scope: "fileDownload" },
                host: { baseUrl: "https://example.com/files/report.txt" },
                label: "File download",
                statusErrors: () => {
                    statusErrorsCalled = true;

                    return undefined;
                },
            });

            expect(response.status).toBe(416);
            expect(await response.text()).toBe("range start");
            expect(statusErrorsCalled).toBeFalse();
            expect(capture.logs()).not.toContain("non-success");
        });
    });

    test("lets an allowed status bypass even the credit check", async () => {
        await withRequestCapture(async (capture) => {
            capture.respondWith(new Response("payment required", { status: 402 }));

            const response = await requestOoResponse({
                allowedStatuses: [402],
                context: capture.context,
                errors: { scope: "fileDownload" },
                host: { baseUrl: "https://example.com/files/report.txt" },
                label: "File download",
            });

            expect(response.status).toBe(402);
        });
    });

    test("maps a disallowed status through the pair scope requestFailed", async () => {
        await withRequestCapture(async (capture) => {
            capture.respondWith(new Response("missing", { status: 404 }));

            await expect(requestOoResponse({
                context: capture.context,
                errors: { scope: "fileDownload" },
                host: { baseUrl: "https://example.com/files/report.txt" },
                label: "File download",
            })).rejects.toMatchObject({
                key: "errors.fileDownload.requestFailed",
                params: { status: 404 },
            });
        });
    });

    test("sends a raw body without an automatic content type", async () => {
        await withRequestCapture(async (capture) => {
            const partBytes = new Uint8Array([1, 2, 3]);

            await requestOoResponse({
                body: partBytes,
                context: capture.context,
                errors: { scope: "fileUpload" },
                headers: { "Content-Type": "application/octet-stream" },
                host: { baseUrl: "https://storage.example.com/part-1?signature=s" },
                label: "File upload part",
                method: "PUT",
            });

            const request = capture.requests[0];

            expect(request?.body).toBe(partBytes);
            expect(request?.headers).toEqual({
                "Content-Type": "application/octet-stream",
            });
        });
    });
});

describe("probeOo", () => {
    test("returns the status and body text on any response", async () => {
        await withRequestCapture(async (capture) => {
            capture.respondWith(new Response("{\"teams\":[]}", { status: 403 }));

            const result = await probeOo({
                authorization: "secret-1",
                context: { fetcher: capture.context.fetcher, logger: capture.context.logger },
                host: { endpoint: "oomol.com", service: "relation-control" },
                label: "Team lookup",
                logFields: { direction: "id" },
                path: "/v1/teams/team-1",
            });

            expect(result).toEqual({
                bodyText: "{\"teams\":[]}",
                kind: "response",
                status: 403,
            });
            expect(capture.requests[0]?.headers).toEqual({ Authorization: "secret-1" });
            expect(capture.logs()).toContain("\"msg\":\"Team lookup request started.\"");
            expect(capture.logs()).toContain("\"msg\":\"Team lookup request completed.\"");
            expect(capture.logs()).toContain("\"direction\":\"id\"");
        });
    });

    test("keeps the status and yields no body text when the body read fails", async () => {
        await withRequestCapture(async (capture) => {
            capture.respondWith(new Response(createBrokenBodyStream(), { status: 200 }));

            const result = await probeOo({
                context: { fetcher: capture.context.fetcher, logger: capture.context.logger },
                host: { endpoint: "oomol.com", service: "api" },
                label: "Auth status",
                path: "/v1/users/profile",
            });

            expect(result).toEqual({
                bodyText: undefined,
                kind: "response",
                status: 200,
            });
        });
    });

    test("classifies a thrown fetch error without throwing", async () => {
        await withRequestCapture(async (capture) => {
            capture.failWith(new Error("boom"));

            const result = await probeOo({
                context: { fetcher: capture.context.fetcher, logger: capture.context.logger },
                host: { endpoint: "oomol.com", service: "api" },
                label: "Auth status",
                path: "/v1/users/profile",
            });

            expect(result).toEqual({ kind: "failed" });
            expect(capture.logs()).toContain(
                "\"msg\":\"Auth status request failed unexpectedly.\"",
            );
        });
    });

    test("classifies a sandbox network error as failed_sandbox", async () => {
        await withRequestCapture(async (capture) => {
            capture.failWith(createFailedToOpenSocketError("network down"));

            const result = await probeOo({
                context: { fetcher: capture.context.fetcher, logger: capture.context.logger },
                host: { endpoint: "oomol.com", service: "api" },
                label: "Auth status",
                path: "/v1/users/profile",
            });

            expect(result).toEqual({ kind: "failed_sandbox" });
        });
    });
});

interface CapturedRequest {
    body: unknown;
    headers: Record<string, string>;
    method: string;
    url: string;
}

interface RequestCapture {
    context: {
        fetcher: (url: URL | string | Request, init?: RequestInit) => Promise<Response>;
        logger: ReturnType<typeof createLogCapture>["logger"];
        translator: ReturnType<typeof createTranslator>;
    };
    failWith: (error: Error) => void;
    logs: () => string;
    requests: CapturedRequest[];
    respondWith: (response: Response) => void;
}

async function withRequestCapture(
    run: (capture: RequestCapture) => Promise<void>,
): Promise<void> {
    const logCapture = createLogCapture();
    const requests: CapturedRequest[] = [];
    let nextResponse: Response | undefined;
    let nextError: Error | undefined;

    const capture: RequestCapture = {
        context: {
            fetcher: async (url, init) => {
                requests.push({
                    body: init?.body,
                    headers: { ...(init?.headers as Record<string, string> | undefined) },
                    method: init?.method ?? "GET",
                    url: url.toString(),
                });

                if (nextError !== undefined) {
                    throw nextError;
                }

                return nextResponse ?? new Response(JSON.stringify({ name: "a" }), {
                    status: 200,
                });
            },
            logger: logCapture.logger,
            translator: createTranslator("en"),
        },
        failWith: (error) => {
            nextError = error;
        },
        logs: () => logCapture.read(),
        requests,
        respondWith: (response) => {
            nextResponse = response;
            nextError = undefined;
        },
    };

    try {
        await run(capture);
    }
    finally {
        logCapture.close();
    }
}

function createBrokenBodyStream(): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            controller.error(new Error("body stream failed"));
        },
    });
}
