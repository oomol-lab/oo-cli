import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { OoRequestFailure } from "../shared/oo-request.ts";

import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { abortableSleep } from "../../shared/abortable-sleep.ts";
import { createRetryingFetcher, sendOnce } from "../../shared/retrying-fetcher.ts";
import { createInsufficientCreditError } from "../shared/billing.ts";
import { requestOoResponse } from "../shared/oo-request.ts";
import { resolveAccountTeamIdentity, teamIdentityHeaders } from "../team/identity.ts";

// The Spaces control plane (`https://spaces.<account endpoint>`): its
// endpoints and the response fields this CLI reads. Responses are validated
// loosely, so a field the service adds later does not break an older CLI.
// Times are Unix seconds.

export const spaceStatuses = ["creating", "live", "suspended", "failed", "deleting"] as const;
export const spaceVisibilities = ["public", "team"] as const;
const jobStatuses = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
const terminalJobStatuses: readonly string[] = ["succeeded", "failed", "cancelled"];

const spaceSchema = z.looseObject({
    id: z.string(),
    teamId: z.string(),
    slug: z.string(),
    name: z.string(),
    status: z.enum(spaceStatuses),
    visibility: z.enum(spaceVisibilities),
    url: z.string(),
    label: z.string(),
    building: z.boolean(),
    convexDeploymentName: z.string().nullable(),
    convexDeploymentUrl: z.string().nullable(),
    // Where the backend of the space runs: `convex`, or `cloudflare` for a
    // backend the platform hosts itself. A service that predates the field
    // only has Convex spaces.
    dataPlane: z.string().optional(),
    nextChargeAt: z.number().nullable(),
    suspendedAt: z.number().nullable(),
    graceUntil: z.number().nullable(),
    lastError: z.string().nullable(),
    createdBy: z.string().nullable(),
    createdAt: z.number(),
    updatedAt: z.number(),
});
export type Space = z.infer<typeof spaceSchema>;

const jobSchema = z.looseObject({
    id: z.string(),
    kind: z.string(),
    status: z.enum(jobStatuses),
    version: z.number().nullable(),
    error: z.string().nullable(),
    attempt: z.number(),
    createdAt: z.number(),
    startedAt: z.number().nullable(),
    finishedAt: z.number().nullable(),
});
export type SpaceJob = z.infer<typeof jobSchema>;

const artifactSchema = z.looseObject({
    id: z.string(),
    version: z.number(),
    status: z.string(),
    rollbackable: z.boolean(),
    active: z.boolean(),
    sizeBytes: z.number(),
    fileCount: z.number(),
    sha256: z.string(),
    createdAt: z.number(),
});
export type SpaceArtifact = z.infer<typeof artifactSchema>;

const accessSchema = z.looseObject({ visibility: z.enum(spaceVisibilities) });
type SpaceAccess = z.infer<typeof accessSchema>;

// The one-hour key `convex deploy` runs with. It only ever travels in memory
// to the child process and is never printed.
const deployCredentialsSchema = z.looseObject({
    deploymentUrl: z.string(),
    deploymentName: z.string(),
    deployKey: z.string(),
    expiresAt: z.number(),
});
type DeployCredentials = z.infer<typeof deployCredentialsSchema>;

// Where the site archive of a deploy goes: a presigned object storage URL with
// the headers that are signed into it. The URL is a credential. It only ever
// travels in memory to the storage request and is never printed or logged.
const deployUploadSchema = z.looseObject({
    uploadId: z.string(),
    upload: z.looseObject({
        method: z.literal("PUT"),
        url: z.string().refine(isStorageUrl),
        headers: z.record(z.string(), z.string()),
    }),
});
type SiteUpload = z.infer<typeof deployUploadSchema>["upload"];

// A deploy of a platform-hosted backend. `uploading` and `expired` belong to a
// deploy that was declared but not committed; `active` is the version that is
// live and `superseded` one that was live until a later deploy replaced it.
const backendDeploySchema = z.looseObject({
    id: z.string(),
    status: z.string(),
    error: z.string().nullish(),
});
export type BackendDeploy = z.infer<typeof backendDeploySchema>;

const backendDeployDeclaredSchema = z.looseObject({
    deploy: backendDeploySchema,
    upload: deployUploadSchema.shape.upload,
});
const backendDeployEnvelopeSchema = z.looseObject({ deploy: backendDeploySchema });
const pendingBackendDeployStatuses: readonly string[] = ["uploading", "queued", "running"];
const liveBackendDeployStatuses: readonly string[] = ["active", "superseded"];

const quotaAmountSchema = z.looseObject({ used: z.number(), limit: z.number() });
const quotaSchema = z.looseObject({
    counters: z.array(z.looseObject({
        name: z.string(),
        unit: z.string(),
        period: quotaAmountSchema,
        day: quotaAmountSchema,
        exhausted: z.string().nullable(),
    })),
    capacities: z.array(z.looseObject({
        name: z.string(),
        used: z.number(),
        limit: z.number(),
        exhausted: z.boolean(),
    })),
});
export type SpaceQuota = z.infer<typeof quotaSchema>;

const usageRecordSchema = z.looseObject({
    spaceId: z.string(),
    day: z.string(),
    sampledAt: z.number(),
    seedStatus: z.string().nullable(),
    metrics: z.record(z.string(), z.looseObject({
        unit: z.string(),
        currentDay: z.number(),
        currentMonth: z.number(),
    })),
});
export type SpaceUsageRecord = z.infer<typeof usageRecordSchema>;

const usagePageSchema = z.looseObject({
    from: z.string(),
    to: z.string(),
    items: z.array(usageRecordSchema),
    // Only a space with a platform-hosted backend has quotas.
    quota: quotaSchema.nullish(),
});
type SpaceUsagePage = z.infer<typeof usagePageSchema>;

const resumeResultSchema = z.looseObject({
    resumed: z.array(spaceSchema),
    skipped: z.array(z.looseObject({ spaceId: z.string(), code: z.string() })),
});
type ResumeResult = z.infer<typeof resumeResultSchema>;

const jobEnvelopeSchema = z.looseObject({ job: jobSchema });
const environmentNameSchema = z.looseObject({ name: z.string() });
const serviceErrorSchema = z.looseObject({
    code: z.string().optional(),
    error: z.string().optional(),
    message: z.string().optional(),
    parameterDetails: z.array(z.unknown()).optional(),
});

const listPageLimit = "100";
const defaultTimeoutMs = 60_000;
// A 50 MB site still uploads within this budget on an 85 KB/s uplink, and the
// budget ends before the upload URL does (15 minutes after it was issued).
const uploadTimeoutMs = 10 * 60_000;
// The service inspects the uploaded archive before it answers, which takes up
// to about a minute; the budget leaves room for the retries of the fetcher.
const commitTimeoutMs = 5 * 60_000;
const storageMaxRetries = 3;
const storageRetryableStatuses = [429, 500, 502, 503, 504];
const inFlightReplayDelayMs = 2_000;
const inFlightMaxReplays = 15;

type SpacesRequestContext = Pick<CliExecutionContext, "fetcher" | "logger" | "translator">;

// Who a Spaces call acts as: the account credential plus the team identity
// headers the gateway turns into the team scope.
interface SpacesApiTarget {
    account: Pick<AuthAccount, "apiKey" | "endpoint">;
    headers: Record<string, string>;
}

interface SpacesApiRequest<Value> {
    /** JSON body. */
    body?: unknown;
    /**
     * How the service tells a repeated write from a new one. `key` (the
     * default) sends an Idempotency-Key. `state` is a write the service
     * deduplicates by its own state: no key, and still safe to retry. `none`
     * is a write that would run again each time: no key, sent exactly once.
     */
    idempotency?: "key" | "none" | "state";
    /** Defaults to GET. */
    method?: "DELETE" | "POST" | "PUT";
    path: string;
    query?: Record<string, string | undefined>;
    schema: z.ZodType<Value>;
    timeoutMs?: number;
}

export interface SpacesClient {
    request: <Value>(request: SpacesApiRequest<Value>) => Promise<Value>;
}

/** The client of a deploy, which also hands the site archive to object storage. */
interface SpacesDeployClient extends SpacesClient {
    store: (upload: SiteUpload, zip: Uint8Array) => Promise<void>;
}

// Resolves the account and team once per invocation; every call of the
// command then acts for that same target.
export async function createSpacesClient(
    input: { team?: string },
    context: CliExecutionContext,
): Promise<SpacesDeployClient> {
    const { account } = await requireIdentity(context);
    const identity = await resolveAccountTeamIdentity(input, account, context);
    const target = { account, headers: teamIdentityHeaders(identity) };

    return {
        request: request => requestSpacesApi(target, context, request),
        store: (upload, zip) => storeSiteArchive(context, upload, zip),
    };
}

// A write carries an Idempotency-Key unless the request says otherwise. The
// CLI-wide fetcher retries 429, 502, 503, 504 and transport failures with the
// same request, hence the same key, so the service replays or reruns a write
// safely. While the first attempt of a key is still running the service
// answers 409 `idempotency_in_flight`; the request is then replayed with that
// key until the original finishes. One deadline covers the whole request: the
// retries of the fetcher and the replays here all run against the same signal.
// A write the service cannot deduplicate is kept away from those retries.
export async function requestSpacesApi<Value>(
    target: SpacesApiTarget,
    context: SpacesRequestContext,
    request: SpacesApiRequest<Value>,
    sleep: (delayMs: number, signal?: AbortSignal) => Promise<unknown> = abortableSleep,
): Promise<Value> {
    const method = request.method ?? "GET";
    const idempotency = request.idempotency ?? "key";
    const deadline = AbortSignal.timeout(request.timeoutMs ?? defaultTimeoutMs);
    const signal = idempotency === "none" ? sendOnce(deadline) : deadline;
    const headers = method === "GET" || idempotency !== "key"
        ? target.headers
        : { ...target.headers, "Idempotency-Key": randomUUIDv7() };
    const query = Object.fromEntries(
        Object.entries(request.query ?? {})
            .filter((entry): entry is [string, string] => entry[1] !== undefined),
    );

    for (let replays = 0; ; replays += 1) {
        const response = await requestOoResponse({
            // A 409 body decides between a replay and a failure, so it is read here.
            allowedStatuses: [409],
            authorization: target.account.apiKey,
            context: {
                fetcher: async (input, init) => await context.fetcher(input, { ...init, signal }),
                logger: context.logger,
                translator: context.translator,
            },
            errors: { scope: "spaces" },
            headers,
            host: { endpoint: target.account.endpoint, service: "spaces" },
            jsonBody: request.body,
            label: "Spaces",
            method,
            path: request.path,
            query,
            statusErrors: mapSpacesApiError,
        });

        if (response.status !== 409) {
            return await decodeSpacesResponse(response, request.schema);
        }

        const failure: OoRequestFailure = {
            bodyText: await response.text().catch(() => undefined),
            response,
            status: response.status,
        };

        if (
            parseServiceError(failure.bodyText)?.code !== "idempotency_in_flight"
            || replays >= inFlightMaxReplays
        ) {
            throw mapSpacesApiError(failure)
                ?? new CliUserError("errors.spaces.requestFailed", 1, { status: failure.status }, {
                    details: { httpStatus: failure.status },
                });
        }

        // A deadline that passes during the pause ends it at once; the next
        // attempt then fails on the same signal and is reported as a timeout.
        await sleep(inFlightReplayDelayMs, signal).catch((error: unknown) => {
            if (!signal.aborted) {
                throw error;
            }
        });
    }
}

async function decodeSpacesResponse<Value>(response: Response, schema: z.ZodType<Value>): Promise<Value> {
    const payload: unknown = await response.json().catch(() => undefined);
    const parsed = schema.safeParse(payload);

    if (!parsed.success) {
        throw new CliUserError("errors.spaces.invalidResponse", 1);
    }

    return parsed.data;
}

// Service codes whose remedy is not obvious from the service message alone.
const serviceErrorKeys: Record<string, string> = {
    backend_upload_expired: "errors.spaces.deployUploadExpired",
    backend_upload_incomplete: "errors.spaces.deployUploadIncomplete",
    backend_uploads_pending: "errors.spaces.backendUploadsPending",
    balance_unavailable: "errors.spaces.balanceUnavailable",
    deploy_in_progress: "errors.spaces.deployInProgress",
    deploy_upload_expired: "errors.spaces.deployUploadExpired",
    deploy_upload_incomplete: "errors.spaces.deployUploadIncomplete",
    deploy_uploads_pending: "errors.spaces.deployUploadsPending",
    manager_required: "errors.spaces.managerRequired",
    space_suspended: "errors.spaces.suspended",
};

// Service codes that refuse what was uploaded: the site archive, the backend
// bundle or its schema. The service message says what is wrong with it, so it
// is shown along with what the refusal means.
const archiveErrorKeys: Record<string, string> = {
    artifact_invalid: "errors.spaces.archiveInvalid",
    artifact_too_large: "errors.spaces.archiveTooLarge",
    backend_bundle_invalid: "errors.spaces.backendBundleInvalid",
    schema_confirmation_required: "errors.spaces.schemaConfirmationRequired",
    schema_rejected: "errors.spaces.schemaRejected",
};

// The service reports a failure as `{ message, code }` and the gateway's team
// check as `{ error, code }`. The message is meant for people, so it is shown
// as is unless the code has a remedy worth spelling out; the code stays
// available to scripts in the details either way. A body that is neither (the
// gateway's plain-text refusals) falls through to the generic failure, except
// for a rejected credential.
function mapSpacesApiError(failure: OoRequestFailure): CliUserError | undefined {
    const parsed = parseServiceError(failure.bodyText);

    if (parsed === undefined) {
        return failure.status === 401
            ? new CliUserError("errors.spaces.unauthorized", 1, undefined, {
                    details: { httpStatus: failure.status },
                })
            : undefined;
    }

    const details = { httpStatus: failure.status, serviceCode: parsed.code };

    // The team cannot pay for a space: the same condition, exit code and
    // billing link as every other balance failure of the CLI.
    if (parsed.code === "insufficient_balance") {
        return createInsufficientCreditError(details);
    }

    const archiveKey = archiveErrorKeys[parsed.code];

    if (archiveKey !== undefined) {
        return new CliUserError(archiveKey, 1, { message: parsed.message }, { details });
    }

    const key = serviceErrorKeys[parsed.code];

    return key === undefined
        ? new CliUserError("errors.spaces.serviceError", 1, {
                code: parsed.code,
                message: parsed.message,
                status: failure.status,
            }, { details })
        : new CliUserError(key, 1, undefined, { details });
}

function parseServiceError(bodyText: string | undefined): { code: string; message: string } | undefined {
    let json: unknown;

    try {
        json = JSON.parse(bodyText ?? "");
    }
    catch {
        return undefined;
    }

    const parsed = serviceErrorSchema.safeParse(json);
    const summary = parsed.data?.message ?? parsed.data?.error;

    if (parsed.data === undefined || summary === undefined) {
        return undefined;
    }

    // A validation failure has no code but lists what was wrong.
    const parameterDetails = parsed.data.parameterDetails;

    return {
        code: parsed.data.code ?? "unknown",
        message: parameterDetails === undefined
            ? summary
            : `${summary} (${parameterDetails.map(detail => JSON.stringify(detail)).join(", ")})`,
    };
}

function isStorageUrl(value: string): boolean {
    return URL.canParse(value) && ["http:", "https:"].includes(new URL(value).protocol);
}

function spacePath(space: string, suffix = ""): string {
    return `/v1/spaces/${encodeURIComponent(space)}${suffix}`;
}

// Lists follow the cursor to the end, so a command always prints every item.
// A page that hands back the cursor it was requested with would repeat forever
// and is refused.
async function listAllPages<Item>(
    client: SpacesClient,
    path: string,
    item: z.ZodType<Item>,
    query: Record<string, string | undefined> = {},
): Promise<Item[]> {
    const schema = z.looseObject({ items: z.array(item), nextCursor: z.string().nullish() });
    const items: Item[] = [];

    for (let cursor: string | undefined; ;) {
        const page = await client.request({ path, query: { ...query, cursor, limit: listPageLimit }, schema });

        items.push(...page.items);

        if (page.nextCursor === null || page.nextCursor === undefined || page.nextCursor === "") {
            return items;
        }

        if (page.nextCursor === cursor) {
            throw new CliUserError("errors.spaces.invalidResponse", 1);
        }

        cursor = page.nextCursor;
    }
}

export async function listSpaces(client: SpacesClient, status: string | undefined): Promise<Space[]> {
    return await listAllPages(client, "/v1/spaces", spaceSchema, { status });
}

export async function createSpace(
    client: SpacesClient,
    input: { name?: string; slug: string; visibility?: string },
): Promise<Space> {
    return await client.request({ body: input, method: "POST", path: "/v1/spaces", schema: spaceSchema });
}

export async function getSpace(client: SpacesClient, space: string): Promise<Space> {
    return await client.request({ path: spacePath(space), schema: spaceSchema });
}

export async function deleteSpace(client: SpacesClient, space: string): Promise<SpaceJob> {
    const { job } = await client.request({ method: "DELETE", path: spacePath(space), schema: jobEnvelopeSchema });

    return job;
}

// Without ids the service resumes every suspended space of the team.
export async function resumeSpaces(client: SpacesClient, spaceIds: string[] | undefined): Promise<ResumeResult> {
    return await client.request({
        body: spaceIds === undefined ? {} : { spaceIds },
        method: "POST",
        path: "/v1/spaces/resume",
        schema: resumeResultSchema,
    });
}

// A site deploy takes three requests, and the archive never passes through
// the control plane: the service declares an upload, the zip goes straight to
// object storage, and the service then inspects it and queues the job.
//
// Each declaration holds one of the few unfinished uploads a space may have
// until it is committed or an hour passes, so it is sent exactly once. A
// commit returns the job of an upload that is already committed, so it is
// retried like a read.
export async function uploadSite(client: SpacesDeployClient, space: string, zip: Uint8Array): Promise<SpaceJob> {
    const declared = await client.request({
        body: { sizeBytes: zip.byteLength },
        idempotency: "none",
        method: "POST",
        path: spacePath(space, "/deploy-uploads"),
        schema: deployUploadSchema,
    });

    await client.store(declared.upload, zip);

    const { job } = await client.request({
        idempotency: "state",
        method: "POST",
        path: spacePath(space, `/deploy-uploads/${encodeURIComponent(declared.uploadId)}/commit`),
        schema: jobEnvelopeSchema,
        timeoutMs: commitTimeoutMs,
    });

    return job;
}

// A backend deploy follows the same three requests with the backend bundle:
// declare, send the zip straight to object storage, commit. The commit has the
// service unpack the bundle and compare its schema with the live one before it
// queues the deploy; `confirm` names the schema changes that break deployed
// code and are intended. A commit of a deploy that is already committed
// returns that deploy, so it is retried like a read.
export async function deployBackendBundle(
    client: SpacesDeployClient,
    space: string,
    zip: Uint8Array,
    confirm: readonly string[],
): Promise<BackendDeploy> {
    const declared = await client.request({
        body: { sizeBytes: zip.byteLength },
        idempotency: "none",
        method: "POST",
        path: spacePath(space, "/backend-deploys"),
        schema: backendDeployDeclaredSchema,
    });

    await client.store(declared.upload, zip);

    const { deploy } = await client.request({
        body: confirm.length === 0 ? {} : { confirm },
        idempotency: "state",
        method: "POST",
        path: spacePath(space, `/backend-deploys/${encodeURIComponent(declared.deploy.id)}/commit`),
        schema: backendDeployEnvelopeSchema,
        timeoutMs: commitTimeoutMs,
    });

    return deploy;
}

export async function getBackendDeploy(
    client: SpacesClient,
    space: string,
    deployId: string,
    timeoutMs?: number,
): Promise<BackendDeploy> {
    return await client.request({
        path: spacePath(space, `/backend-deploys/${encodeURIComponent(deployId)}`),
        schema: backendDeploySchema,
        timeoutMs,
    });
}

export function isPendingBackendDeploy(deploy: BackendDeploy): boolean {
    return pendingBackendDeployStatuses.includes(deploy.status);
}

/** The deploy took effect: it is live, or was until a later deploy replaced it. */
export function isLiveBackendDeploy(deploy: BackendDeploy): boolean {
    return liveBackendDeployStatuses.includes(deploy.status);
}

// Sends the archive to object storage. This request is not an OOMOL request:
// it carries the signed headers and nothing else, so neither the credential
// nor the team of the account leaves for the storage host.
//
// The zip goes up as one buffer, so an attempt that failed can be repeated
// and overwrites the same object. One deadline covers all attempts.
//
// The upload URL is known to the innermost fetcher alone. Everything that
// logs a request (the request helper and the retries, which therefore happen
// here rather than in the CLI-wide fetcher) is handed the origin of the
// storage host, and every failure is stripped of the URL before it leaves
// that fetcher. A log line or an error message can thus name the storage
// host, never the object path or the signature.
export async function storeSiteArchive(
    context: SpacesRequestContext,
    upload: SiteUpload,
    zip: Uint8Array,
    sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>,
): Promise<void> {
    const signedLength = new Headers(upload.headers).get("Content-Length");

    // The length is signed into the URL; storage would refuse any other body.
    if (signedLength !== null && signedLength !== String(zip.byteLength)) {
        throw new CliUserError("errors.spaces.invalidResponse", 1);
    }

    const deadline = AbortSignal.timeout(uploadTimeoutMs);
    // Follows the deadline, and tells the CLI-wide fetcher to leave the
    // retries to the fetcher below.
    const attemptSignal = sendOnce(AbortSignal.any([deadline]));
    const retryingFetcher = createRetryingFetcher({
        fetcher: async (_storageOrigin, init) => {
            try {
                return await context.fetcher(upload.url, { ...init, signal: attemptSignal });
            }
            catch (error) {
                throw withoutUploadUrl(error, upload.url);
            }
        },
        logger: context.logger,
        maxRetries: storageMaxRetries,
        retryableStatusCodes: storageRetryableStatuses,
        sleep,
    });

    await requestOoResponse({
        body: zip,
        context: {
            fetcher: async (input, init) => await retryingFetcher(input, { ...init, signal: deadline }),
            logger: context.logger,
            translator: context.translator,
        },
        errors: { requestError: "errors.spaces.uploadError", requestFailed: "errors.spaces.uploadFailed" },
        headers: upload.headers,
        host: { baseUrl: new URL(upload.url).origin },
        label: "Spaces site upload",
        method: "PUT",
    });
}

// A failed storage request as it may be logged and shown: the error keeps its
// name, its code and its message, and loses everything else it carried (Bun
// puts the request URL on `path`). Should the message quote the URL, the
// quote is cut down to the origin.
function withoutUploadUrl(error: unknown, uploadUrl: string): Error {
    const source = error instanceof Error ? error : new Error(String(error));
    const url = new URL(uploadUrl);
    let message = source.message;

    for (const quoted of [uploadUrl, url.href]) {
        message = message.replaceAll(quoted, url.origin);
    }

    if (url.search !== "") {
        message = message.replaceAll(url.search, "");
    }

    const safe = new Error(message);

    safe.name = source.name;

    return "code" in source && typeof source.code === "string"
        ? Object.assign(safe, { code: source.code })
        : safe;
}

export async function listJobs(client: SpacesClient, space: string): Promise<SpaceJob[]> {
    return await listAllPages(client, spacePath(space, "/deploys"), jobSchema);
}

/** `timeoutMs` shortens the request budget, for a caller with a deadline of its own. */
export async function getJob(client: SpacesClient, space: string, jobId: string, timeoutMs?: number): Promise<SpaceJob> {
    return await client.request({
        path: spacePath(space, `/deploys/${encodeURIComponent(jobId)}`),
        schema: jobSchema,
        timeoutMs: timeoutMs === undefined ? undefined : Math.min(timeoutMs, defaultTimeoutMs),
    });
}

export async function rollbackSpace(client: SpacesClient, space: string, version: number): Promise<SpaceJob> {
    const { job } = await client.request({
        body: { version },
        method: "POST",
        path: spacePath(space, "/rollback"),
        schema: jobEnvelopeSchema,
    });

    return job;
}

export async function listArtifacts(client: SpacesClient, space: string): Promise<SpaceArtifact[]> {
    const { items } = await client.request({
        path: spacePath(space, "/artifacts"),
        schema: z.looseObject({ items: z.array(artifactSchema) }),
    });

    return items;
}

export async function getAccess(client: SpacesClient, space: string): Promise<SpaceAccess> {
    return await client.request({ path: spacePath(space, "/access"), schema: accessSchema });
}

export async function setAccess(client: SpacesClient, space: string, visibility: string): Promise<SpaceAccess> {
    return await client.request({
        body: { visibility },
        method: "PUT",
        path: spacePath(space, "/access"),
        schema: accessSchema,
    });
}

export async function revokeSessions(client: SpacesClient, space: string): Promise<void> {
    await client.request({
        body: {},
        method: "POST",
        path: spacePath(space, "/access/revoke-sessions"),
        schema: z.looseObject({ ok: z.literal(true) }),
    });
}

export async function issueDeployCredentials(client: SpacesClient, space: string): Promise<DeployCredentials> {
    return await client.request({
        body: {},
        method: "POST",
        path: spacePath(space, "/deploy-credentials"),
        schema: deployCredentialsSchema,
    });
}

// One record per day; the service caps the range at 366 days and does not page.
export async function listUsage(
    client: SpacesClient,
    space: string,
    range: { from?: string; to?: string },
): Promise<SpaceUsagePage> {
    return await client.request({ path: spacePath(space, "/usage"), query: range, schema: usagePageSchema });
}

// Environment variable values are write-only. The results pick their fields
// explicitly, so a value never reaches the output even if the service were to
// return one.
export async function listEnvironmentNames(client: SpacesClient, space: string): Promise<{ names: string[] }> {
    const { names } = await client.request({
        path: spacePath(space, "/env"),
        schema: z.looseObject({ names: z.array(z.string()) }),
    });

    return { names };
}

export async function setEnvironmentVariable(
    client: SpacesClient,
    space: string,
    name: string,
    value: string,
): Promise<{ name: string }> {
    await client.request({
        body: { value },
        method: "PUT",
        path: spacePath(space, `/env/${encodeURIComponent(name)}`),
        schema: environmentNameSchema,
    });

    return { name };
}

export async function removeEnvironmentVariable(
    client: SpacesClient,
    space: string,
    name: string,
): Promise<{ name: string }> {
    await client.request({
        method: "DELETE",
        path: spacePath(space, `/env/${encodeURIComponent(name)}`),
        schema: environmentNameSchema,
    });

    return { name };
}

export function isTerminalJob(job: SpaceJob): boolean {
    return terminalJobStatuses.includes(job.status);
}
