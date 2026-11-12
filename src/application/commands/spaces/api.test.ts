import type { Fetcher } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createLogCapture, expectCliUserError, toRequest } from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { listSpaces, requestSpacesApi } from "./api.ts";

const target = { account: { apiKey: "secret-1", endpoint: "oomol.com" }, headers: { "x-oo-team-name": "team-a" } };
const schema = z.object({ ok: z.boolean() });

describe("spaces api requests", () => {
    test("sends a read without an idempotency key and drops unset query values", async () => {
        const { requests, send } = createApi(() => Response.json({ ok: true }));

        expect(await send({ path: "/v1/spaces", query: { cursor: undefined, limit: "100" }, schema })).toEqual({ ok: true });
        expect(requests[0]!.method).toBe("GET");
        expect(requests[0]!.url).toBe("https://spaces.oomol.com/v1/spaces?limit=100");
        expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
        expect(requests[0]!.headers.get("x-oo-team-name")).toBe("team-a");
        expect(requests[0]!.headers.get("Idempotency-Key")).toBeNull();
    });

    test("replays a write that is still in flight with the same idempotency key", async () => {
        const sleeps: number[] = [];
        const responses = [
            Response.json({ code: "idempotency_in_flight", message: "in flight" }, { status: 409 }),
            Response.json({ ok: true }),
        ];
        const { requests, send } = createApi(() => responses.shift()!, async (delayMs) => {
            sleeps.push(delayMs);
        });

        expect(await send({ body: { slug: "blog" }, method: "POST", path: "/v1/spaces", schema })).toEqual({ ok: true });
        expect(sleeps).toEqual([2_000]);
        expect(requests).toHaveLength(2);
        expect(requests[0]!.headers.get("Idempotency-Key")).toBeTruthy();
        expect(requests[1]!.headers.get("Idempotency-Key")).toBe(requests[0]!.headers.get("Idempotency-Key"));
    });

    test("runs every replay against the deadline of the first attempt", async () => {
        const responses = [
            Response.json({ code: "idempotency_in_flight", message: "in flight" }, { status: 409 }),
            Response.json({ ok: true }),
        ];
        const { send, signals } = createApi(() => responses.shift()!);

        await send({ method: "POST", path: "/v1/spaces", schema });

        expect(signals).toHaveLength(2);
        expect(signals[0]).toBeInstanceOf(AbortSignal);
        expect(signals[1]).toBe(signals[0]);
    });

    test("sends raw bytes with their content type", async () => {
        const { requests, send } = createApi(() => Response.json({ ok: true }));
        const zip = new Uint8Array([0x50, 0x4B, 3, 4]);

        await send({ bytes: { body: zip, contentType: "application/zip" }, method: "POST", path: "/v1/spaces/blog/deploys", schema });

        expect(requests[0]!.headers.get("Content-Type")).toBe("application/zip");
        expect(new Uint8Array(await requests[0]!.arrayBuffer())).toEqual(zip);
    });

    test.each([
        {
            body: { code: "deploy_in_progress", message: "busy" },
            details: { httpStatus: 409, serviceCode: "deploy_in_progress" },
            exitCode: 1,
            key: "errors.spaces.deployInProgress",
            status: 409,
            title: "a conflict that is not an in-flight replay",
        },
        {
            body: { code: "space_suspended", message: "suspended" },
            details: { httpStatus: 409, serviceCode: "space_suspended" },
            exitCode: 1,
            key: "errors.spaces.suspended",
            status: 409,
            title: "a suspended space",
        },
        {
            body: { code: "insufficient_balance", message: "no credit" },
            details: { billingUrl: "https://console.oomol.com/billing", httpStatus: 402, serviceCode: "insufficient_balance" },
            exitCode: 3,
            key: "errors.billing.insufficientCredit",
            status: 402,
            title: "an insufficient balance",
        },
        {
            body: { code: "TEAM_ACCESS_DENIED", error: "not a member" },
            details: { httpStatus: 403, serviceCode: "TEAM_ACCESS_DENIED" },
            exitCode: 1,
            key: "errors.spaces.serviceError",
            status: 403,
            title: "the gateway's team refusal",
        },
        {
            body: { message: "Invalid request parameters", parameterDetails: [{ path: "slug" }] },
            details: { httpStatus: 400, serviceCode: "unknown" },
            exitCode: 1,
            key: "errors.spaces.serviceError",
            status: 400,
            title: "a validation failure without a code",
        },
    ])("maps $title", async ({ body, details, exitCode, key, status }) => {
        const { send } = createApi(() => Response.json(body, { status }));
        const error = await expectCliUserError(send({ body: {}, method: "POST", path: "/v1/spaces", schema }));

        expect(error.key).toBe(key);
        expect(error.exitCode).toBe(exitCode);
        expect(error.details).toEqual(details);
    });

    test("includes the validation details in the service message", async () => {
        const { send } = createApi(() => Response.json({
            message: "Invalid request parameters",
            parameterDetails: [{ path: "slug" }],
        }, { status: 400 }));
        const error = await expectCliUserError(send({ path: "/v1/spaces", schema }));

        expect(error.params).toEqual({
            code: "unknown",
            message: "Invalid request parameters ({\"path\":\"slug\"})",
            status: 400,
        });
    });

    test("maps plain-text gateway refusals by status", async () => {
        const unauthorized = createApi(() => new Response("invalid api key", { status: 401 }));
        const unavailable = createApi(() => new Response("upstream down", { status: 500 }));

        expect((await expectCliUserError(unauthorized.send({ path: "/v1/spaces", schema }))).key)
            .toBe("errors.spaces.unauthorized");
        expect((await expectCliUserError(unavailable.send({ path: "/v1/spaces", schema }))).key)
            .toBe("errors.spaces.requestFailed");
    });

    test("rejects a response that does not match the schema", async () => {
        const { send } = createApi(() => Response.json({ ok: "yes" }));

        expect((await expectCliUserError(send({ path: "/v1/spaces", schema }))).key).toBe("errors.spaces.invalidResponse");
    });
});

describe("spaces api deadlines", () => {
    test("ends the pause before a replay when the request deadline passes", async () => {
        let attempts = 0;
        const fetcher: Fetcher = async (_input, init) => {
            attempts += 1;
            // Like fetch itself: a request on an aborted signal fails at once.
            init?.signal?.throwIfAborted();

            return Response.json({ code: "idempotency_in_flight", message: "in flight" }, { status: 409 });
        };
        const context = { fetcher, logger: createLogCapture().logger, translator: createTranslator("en") };
        const startedAt = Date.now();

        // The replay is due after two seconds, well past this deadline.
        await expect(requestSpacesApi(target, context, { method: "POST", path: "/v1/spaces", schema, timeoutMs: 40 }))
            .rejects
            .toBeDefined();

        expect(attempts).toBe(2);
        expect(Date.now() - startedAt).toBeLessThan(1_500);
    });
});

describe("spaces api lists", () => {
    test("refuses a page that hands back the cursor it was requested with", async () => {
        const cursors: (string | undefined)[] = [];
        const pages = [{ items: [], nextCursor: "cursor-1" }, { items: [], nextCursor: "cursor-1" }];
        const error = await expectCliUserError(listSpaces({
            request: async (request) => {
                cursors.push(request.query?.cursor);

                return request.schema.parse(pages.shift());
            },
        }, undefined));

        expect(error.key).toBe("errors.spaces.invalidResponse");
        expect(cursors).toEqual([undefined, "cursor-1"]);
    });
});

// Binds requestSpacesApi to a fake fetcher and records what it was sent.
function createApi(respond: () => Response, sleep: (delayMs: number) => Promise<unknown> = async () => {}) {
    const requests: Request[] = [];
    const signals: unknown[] = [];
    const fetcher: Fetcher = async (input, init) => {
        requests.push(toRequest(input, init));
        signals.push(init?.signal);

        return respond();
    };
    const context = { fetcher, logger: createLogCapture().logger, translator: createTranslator("en") };

    return {
        requests,
        signals,
        send: async <Value>(request: Parameters<typeof requestSpacesApi<Value>>[2]) =>
            await requestSpacesApi(target, context, request, sleep),
    };
}
