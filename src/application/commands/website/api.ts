import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { OoRequestFailure } from "../shared/oo-request.ts";

import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { createRetryingFetcher } from "../../shared/retrying-fetcher.ts";
import { requestOo } from "../shared/oo-request.ts";

export type WebsiteRequestContext = Pick<CliExecutionContext, "fetcher" | "logger" | "translator">;

// Who a websites-api call acts as: the account credential plus the team
// identity headers the gateway turns into the team scope.
export interface WebsitesApiTarget {
    account: Pick<AuthAccount, "apiKey" | "endpoint">;
    headers: Record<string, string>;
}

export const customDomainSchema = z.object({
    hostname: z.string(),
    url: z.string(),
    status: z.enum(["pending", "active", "error"]),
    message: z.string().nullable(),
    dns: z.object({ type: z.string(), name: z.string(), value: z.string() }),
    created_at: z.number(),
    checked_at: z.number().nullable(),
});

export const websiteSchema = z.object({
    id: z.string(),
    team_id: z.string(),
    name: z.string(),
    status: z.enum(["draft", "live"]),
    hostname: z.string(),
    url: z.string(),
    active_deployment_id: z.string().nullable(),
    // Absent on a service version that predates custom domains.
    custom_domain: customDomainSchema.nullable().optional(),
    created_at: z.number(),
    updated_at: z.number(),
});

export const deploymentSchema = z.object({
    id: z.string(),
    website_id: z.string(),
    status: z.enum(["uploading", "succeeded", "failed", "expired"]),
    active: z.boolean(),
    restorable: z.boolean(),
    file_count: z.number(),
    total_bytes: z.number(),
    error_message: z.string().nullable(),
    upload_expires_at: z.number(),
    created_at: z.number(),
    published_at: z.number().nullable(),
    pruned_at: z.number().nullable(),
});

const serviceErrorSchema = z.object({ message: z.string(), code: z.string() });

// Transient gateway failures are retried with the same request, so a POST
// keeps its Idempotency-Key and the service replays or reruns it safely.
// 429 is left to the caller: the service uses it for deployment quotas whose
// Retry-After outlasts any in-process backoff.
const retryableStatusCodes = [502, 503, 504] as const;

interface WebsitesApiRequest<Value> {
    /** JSON body; its presence makes the request a POST. */
    body?: unknown;
    /** Reused across runs by callers that journal an attempt; fresh otherwise. */
    idempotencyKey?: string;
    /** Only for requests that are neither a plain read nor a POST with a body. */
    method?: "DELETE";
    path: string;
    query?: Record<string, string>;
    schema: z.ZodType<Value>;
}

export async function requestWebsitesApi<Value>(
    target: WebsitesApiTarget,
    context: WebsiteRequestContext,
    request: WebsitesApiRequest<Value>,
): Promise<Value> {
    const isPost = request.body !== undefined;

    return await requestOo({
        authorization: target.account.apiKey,
        context: {
            fetcher: createRetryingFetcher({
                fetcher: context.fetcher,
                logger: context.logger,
                retryableStatusCodes,
            }),
            logger: context.logger,
            translator: context.translator,
        },
        errors: { scope: "websiteManaged" },
        headers: isPost
            ? { ...target.headers, "Idempotency-Key": request.idempotencyKey ?? randomUUIDv7() }
            : target.headers,
        host: { endpoint: target.account.endpoint, service: "websites-api" },
        jsonBody: request.body,
        label: "Managed website",
        method: request.method ?? (isPost ? "POST" : "GET"),
        path: request.path,
        query: request.query,
        schema: request.schema,
        statusErrors: mapWebsitesApiError,
    });
}

// The service reports every failure as `{ message, code }`. The message is
// meant for people (for a rejected deployment it carries Cloudflare's reason),
// so it is shown as is; the code stays available to scripts in the details.
function mapWebsitesApiError(failure: OoRequestFailure): CliUserError | undefined {
    const parsed = parseServiceError(failure.bodyText);

    if (parsed === undefined) {
        return undefined;
    }

    const details = { httpStatus: failure.status, serviceCode: parsed.code };

    if (parsed.code === "deployment_rejected") {
        return new CliUserError("errors.websiteManaged.deploymentRejected", 1, {
            message: parsed.message,
        }, { details });
    }

    return new CliUserError("errors.websiteManaged.serviceError", 1, {
        code: parsed.code,
        message: parsed.message,
        status: failure.status,
    }, { details });
}

function parseServiceError(bodyText: string | undefined): z.infer<typeof serviceErrorSchema> | undefined {
    if (bodyText === undefined) {
        return undefined;
    }

    try {
        const result = serviceErrorSchema.safeParse(JSON.parse(bodyText));

        return result.success ? result.data : undefined;
    }
    catch {
        return undefined;
    }
}

export function websitePath(websiteId: string, suffix = ""): string {
    return `/v1/websites/${encodeURIComponent(websiteId)}${suffix}`;
}
