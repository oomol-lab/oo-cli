import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { OoRequestFailure } from "../shared/oo-request.ts";

import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { CliUserError } from "../../contracts/cli.ts";
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
// A 50 MB site still uploads within this budget on an 85 KB/s uplink.
const uploadTimeoutMs = 10 * 60_000;
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
    /** Raw body, sent with the given content type instead of a JSON body. */
    bytes?: { body: Uint8Array; contentType: string };
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

// Resolves the account and team once per invocation; every call of the
// command then acts for that same target.
export async function createSpacesClient(
    input: { team?: string },
    context: CliExecutionContext,
): Promise<SpacesClient> {
    const { account } = await requireIdentity(context);
    const identity = await resolveAccountTeamIdentity(input, account, context);
    const target = { account, headers: teamIdentityHeaders(identity) };

    return { request: request => requestSpacesApi(target, context, request) };
}

// Every write carries an Idempotency-Key. The CLI-wide fetcher retries 429,
// 502, 503, 504 and transport failures with the same request, hence the same
// key, so the service replays or reruns a write safely. While the first
// attempt of a key is still running the service answers 409
// `idempotency_in_flight`; the request is then replayed with that key until
// the original finishes.
export async function requestSpacesApi<Value>(
    target: SpacesApiTarget,
    context: SpacesRequestContext,
    request: SpacesApiRequest<Value>,
    sleep: (delayMs: number) => Promise<unknown> = Bun.sleep,
): Promise<Value> {
    const method = request.method ?? "GET";
    const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
    const headers = method === "GET"
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
            body: request.bytes?.body,
            context: {
                // One budget for the whole request, retries included.
                fetcher: async (input, init) => await context.fetcher(input, {
                    ...init,
                    signal: AbortSignal.timeout(timeoutMs),
                }),
                logger: context.logger,
                translator: context.translator,
            },
            errors: { scope: "spaces" },
            headers: request.bytes === undefined
                ? headers
                : { ...headers, "Content-Type": request.bytes.contentType },
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

        await sleep(inFlightReplayDelayMs);
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
    balance_unavailable: "errors.spaces.balanceUnavailable",
    deploy_in_progress: "errors.spaces.deployInProgress",
    manager_required: "errors.spaces.managerRequired",
    space_suspended: "errors.spaces.suspended",
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

function spacePath(space: string, suffix = ""): string {
    return `/v1/spaces/${encodeURIComponent(space)}${suffix}`;
}

// Lists follow the cursor to the end, so a command always prints every item.
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

// The zip goes up as one buffer: a streamed body would be sent chunked,
// which the service refuses for lacking a Content-Length.
export async function uploadSite(client: SpacesClient, space: string, zip: Uint8Array): Promise<SpaceJob> {
    const { job } = await client.request({
        bytes: { body: zip, contentType: "application/zip" },
        method: "POST",
        path: spacePath(space, "/deploys"),
        schema: jobEnvelopeSchema,
        timeoutMs: uploadTimeoutMs,
    });

    return job;
}

export async function listJobs(client: SpacesClient, space: string): Promise<SpaceJob[]> {
    return await listAllPages(client, spacePath(space, "/deploys"), jobSchema);
}

export async function getJob(client: SpacesClient, space: string, jobId: string): Promise<SpaceJob> {
    return await client.request({
        path: spacePath(space, `/deploys/${encodeURIComponent(jobId)}`),
        schema: jobSchema,
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
