import type { Fetcher } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { createLogCapture, expectCliUserError, toRequest } from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { createRetryingFetcher } from "../../shared/retrying-fetcher.ts";
import { listSpaces, requestSpacesApi, storeSiteArchive, uploadSite } from "./api.ts";

const target = { account: { apiKey: "secret-1", endpoint: "oomol.com" }, headers: { "x-oo-team-name": "team-a" } };
const schema = z.object({ ok: z.boolean() });
const zip = new Uint8Array([0x50, 0x4B, 3, 4]);
const signature = "sig-secret";
const uploadUrl = `https://storage.example.test/bucket/site.zip?X-Amz-Expires=900&X-Amz-Signature=${signature}`;
const uploadId = "0198a6f0-0000-7000-8000-00000000000a";
const declared = {
    uploadId,
    upload: {
        method: "PUT" as const,
        url: uploadUrl,
        headers: { "Content-Type": "application/zip", "Content-Length": String(zip.byteLength) },
    },
    uploadExpiresAt: 1_700_000_900,
    commitBefore: 1_700_003_600,
};
const job = {
    id: "0198a6f0-0000-7000-8000-000000000002",
    kind: "deploy",
    status: "queued" as const,
    version: null,
    error: null,
    attempt: 0,
    createdAt: 1_700_000_200,
    startedAt: null,
    finishedAt: null,
};
const declarePath = "POST /v1/spaces/blog/deploy-uploads";
const commitPath = `POST /v1/spaces/blog/deploy-uploads/${uploadId}/commit`;
const storagePath = "PUT /bucket/site.zip";

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

    test.each([
        { idempotency: "state" as const, title: "a write the service deduplicates by its state" },
        { idempotency: "none" as const, title: "a write the service cannot deduplicate" },
    ])("sends $title without an idempotency key", async ({ idempotency }) => {
        const { requests, send } = createApi(() => Response.json({ ok: true }));

        await send({ body: {}, idempotency, method: "POST", path: "/v1/spaces", schema });

        expect(requests[0]!.headers.get("Idempotency-Key")).toBeNull();
        expect(requests[0]!.headers.get("Authorization")).toBe("secret-1");
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
            body: { code: "deploy_uploads_pending", message: "Too many uncommitted deploy uploads" },
            details: { httpStatus: 429, serviceCode: "deploy_uploads_pending" },
            exitCode: 1,
            key: "errors.spaces.deployUploadsPending",
            status: 429,
            title: "too many unfinished uploads",
        },
        {
            body: { code: "deploy_upload_expired", message: "Deploy upload expired, start a new deploy" },
            details: { httpStatus: 409, serviceCode: "deploy_upload_expired" },
            exitCode: 1,
            key: "errors.spaces.deployUploadExpired",
            status: 409,
            title: "an expired upload",
        },
        {
            body: { code: "deploy_upload_incomplete", message: "Site archive is not uploaded yet" },
            details: { httpStatus: 409, serviceCode: "deploy_upload_incomplete" },
            exitCode: 1,
            key: "errors.spaces.deployUploadIncomplete",
            status: 409,
            title: "an upload the service has not received",
        },
        {
            body: { code: "artifact_invalid", message: "zip cannot be read: end of central directory record not found" },
            details: { httpStatus: 422, serviceCode: "artifact_invalid" },
            exitCode: 1,
            key: "errors.spaces.archiveInvalid",
            params: { message: "zip cannot be read: end of central directory record not found" },
            status: 422,
            title: "a refused archive with the reason of the service",
        },
        {
            body: { code: "artifact_too_large", message: "Artifact exceeds the size limit of 52428800 bytes" },
            details: { httpStatus: 413, serviceCode: "artifact_too_large" },
            exitCode: 1,
            key: "errors.spaces.archiveTooLarge",
            params: { message: "Artifact exceeds the size limit of 52428800 bytes" },
            status: 413,
            title: "an archive over the size limit with the reason of the service",
        },
        {
            body: { code: "deploy_upload_not_found", message: "Deploy upload not found" },
            details: { httpStatus: 404, serviceCode: "deploy_upload_not_found" },
            exitCode: 1,
            key: "errors.spaces.serviceError",
            status: 404,
            title: "an unknown upload by the service message",
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
    ])("maps $title", async ({ body, details, exitCode, key, params, status }) => {
        const { send } = createApi(() => Response.json(body, { status }));
        const error = await expectCliUserError(send({ body: {}, method: "POST", path: "/v1/spaces", schema }));

        expect(error.key).toBe(key);
        expect(error.exitCode).toBe(exitCode);
        expect(error.details).toEqual(details);

        if (params !== undefined) {
            expect(error.params).toEqual(params);
        }
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

describe("spaces site upload", () => {
    test("declares the upload, sends the archive to storage and commits, in that order", async () => {
        const site = createSite({
            [declarePath]: () => Response.json(declared, { status: 201 }),
            [storagePath]: () => new Response(null, { status: 200 }),
            [commitPath]: () => Response.json({ job }, { status: 202 }),
        });

        expect(await uploadSite(site.client, "blog", zip)).toEqual(job);
        expect(site.calls.map(call => call.route)).toEqual([declarePath, storagePath, commitPath]);

        const [declare, storage, commit] = site.calls as [SiteCall, SiteCall, SiteCall];

        expect(declare.url).toBe("https://spaces.oomol.com/v1/spaces/blog/deploy-uploads");
        expect(declare.headers).toEqual({
            "authorization": "secret-1",
            "content-type": "application/json",
            "x-oo-team-name": "team-a",
        });
        expect(JSON.parse(declare.body as string)).toEqual({ sizeBytes: zip.byteLength });

        // Storage gets the signed headers and nothing that identifies the account.
        expect(storage.url).toBe(uploadUrl);
        expect(storage.headers).toEqual({ "content-length": String(zip.byteLength), "content-type": "application/zip" });
        expect(storage.body).toEqual(zip);

        expect(commit.headers).toEqual({ "authorization": "secret-1", "x-oo-team-name": "team-a" });
        expect(commit.body).toBeUndefined();
    });

    test("sends the declaration exactly once, whatever the answer", async () => {
        const unavailable = createSite({ [declarePath]: () => new Response("upstream down", { status: 503 }) });
        const dropped = createSite({
            [declarePath]: () => {
                throw new Error("socket closed");
            },
        });

        expect((await expectCliUserError(uploadSite(unavailable.client, "blog", zip))).key).toBe("errors.spaces.requestFailed");
        expect((await expectCliUserError(uploadSite(dropped.client, "blog", zip))).key).toBe("errors.spaces.requestError");
        expect(unavailable.calls.map(call => call.route)).toEqual([declarePath]);
        expect(dropped.calls.map(call => call.route)).toEqual([declarePath]);
        expect(unavailable.sleeps).toEqual([]);
    });

    test("retries a commit, which returns the job of an upload that is already committed", async () => {
        const answers = [
            () => new Response("upstream down", { status: 502 }),
            (): Response => {
                throw new Error("socket closed");
            },
            () => Response.json({ job }, { status: 202 }),
        ];
        const site = createSite({
            [declarePath]: () => Response.json(declared, { status: 201 }),
            [storagePath]: () => new Response(null, { status: 200 }),
            [commitPath]: () => answers.shift()!(),
        });

        expect(await uploadSite(site.client, "blog", zip)).toEqual(job);
        expect(site.calls.map(call => call.route)).toEqual([declarePath, storagePath, commitPath, commitPath, commitPath]);
        expect(site.calls.every(call => call.headers["idempotency-key"] === undefined)).toBe(true);
    });

    test("retries the storage upload on its own, with the same request", async () => {
        const answers = [
            () => new Response("<Error><Code>InternalError</Code></Error>", { status: 500 }),
            (): Response => {
                throw new Error("socket closed");
            },
            () => new Response(null, { status: 200 }),
        ];
        const site = createSite({ [storagePath]: () => answers.shift()!() });

        await site.client.store(declared.upload, zip);

        expect(site.calls).toHaveLength(3);
        expect(site.sleeps).toEqual([1_000, 2_000]);
        expect(new Set(site.calls.map(call => call.url))).toEqual(new Set([uploadUrl]));
        expect(site.calls.every(call => call.headers.authorization === undefined)).toBe(true);
    });

    test("reports a refused storage upload by its status and never retries it", async () => {
        const site = createSite({
            [storagePath]: () => new Response(`<Error><Code>SignatureDoesNotMatch</Code><Url>${uploadUrl}</Url></Error>`, { status: 403 }),
        });
        const error = await expectCliUserError(site.client.store(declared.upload, zip));

        expect(error.key).toBe("errors.spaces.uploadFailed");
        expect(error.params).toEqual({ status: 403 });
        expect(error.details).toEqual({ httpStatus: 403 });
        expect(site.calls).toHaveLength(1);
        expect(site.logs()).not.toContain(signature);
    });

    test("keeps the upload URL out of the error and the logs when storage cannot be reached", async () => {
        const site = createSite({
            [storagePath]: () => {
                // Bun reports the request URL on `path`; the message is the worst case.
                throw Object.assign(new Error(`Unable to connect to ${uploadUrl}`), { code: "ConnectionRefused", path: uploadUrl });
            },
        });
        const error = await expectCliUserError(site.client.store(declared.upload, zip));

        expect(error.key).toBe("errors.spaces.uploadError");
        expect(String(error.params?.message)).toStartWith("Unable to connect to https://storage.example.test\n");
        expect(JSON.stringify(error)).not.toContain(signature);
        // One layer of retries: the CLI-wide fetcher leaves them to the upload.
        expect(site.calls).toHaveLength(4);
        expect(site.sleeps).toEqual([1_000, 2_000, 4_000]);
        expect(site.logs()).toContain("HTTP request retry scheduled after a network failure.");
        expect(site.logs()).not.toContain(signature);
        expect(site.logs()).not.toContain("X-Amz-Expires");
    });

    test("refuses an upload whose signed length is not the length of the archive", async () => {
        const site = createSite({});
        const upload = { ...declared.upload, headers: { "Content-Length": "5", "Content-Type": "application/zip" } };

        expect((await expectCliUserError(site.client.store(upload, zip))).key).toBe("errors.spaces.invalidResponse");
        expect(site.calls).toHaveLength(0);
    });

    test.each([
        { title: "is not an http(s) URL", upload: { ...declared.upload, url: "file:///tmp/site.zip" } },
        { title: "is not a URL", upload: { ...declared.upload, url: `not a url ${signature}` } },
        { title: "asks for another method", upload: { ...declared.upload, method: "POST" } },
    ])("refuses a declaration whose upload $title", async ({ upload }) => {
        const site = createSite({ [declarePath]: () => Response.json({ ...declared, upload }, { status: 201 }) });
        const error = await expectCliUserError(uploadSite(site.client, "blog", zip));

        expect(error.key).toBe("errors.spaces.invalidResponse");
        expect(JSON.stringify(error)).not.toContain(signature);
        expect(site.calls.map(call => call.route)).toEqual([declarePath]);
        expect(site.logs()).not.toContain(signature);
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

interface SiteCall {
    body: unknown;
    headers: Record<string, string>;
    route: string;
    url: string;
}

// A deploy client over a fake network, behind the retrying fetcher every
// command runs with. Routes are keyed by "<METHOD> <path>"; the headers and
// the body are recorded as they were handed to fetch.
function createSite(routes: Record<string, () => Response>) {
    const calls: SiteCall[] = [];
    const sleeps: number[] = [];
    const logCapture = createLogCapture();
    const sleep = async (delayMs: number): Promise<void> => {
        sleeps.push(delayMs);
    };
    const context = {
        fetcher: createRetryingFetcher({
            fetcher: async (input, init) => {
                const url = String(input);
                const route = `${init?.method} ${new URL(url).pathname}`;

                calls.push({
                    body: init?.body ?? undefined,
                    headers: Object.fromEntries(new Headers(init?.headers).entries()),
                    route,
                    url,
                });

                const respond = routes[route];

                if (respond === undefined) {
                    throw new Error(`Unexpected request: ${route}`);
                }

                return respond();
            },
            logger: logCapture.logger,
            sleep,
        }),
        logger: logCapture.logger,
        translator: createTranslator("en"),
    };

    return {
        calls,
        client: {
            request: async <Value>(request: Parameters<typeof requestSpacesApi<Value>>[2]) =>
                await requestSpacesApi(target, context, request, sleep),
            store: async (upload: Parameters<typeof storeSiteArchive>[1], archive: Uint8Array) =>
                await storeSiteArchive(context, upload, archive, sleep),
        },
        logs: () => logCapture.read(),
        sleeps,
    };
}
