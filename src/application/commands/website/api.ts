import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { OoRequestFailure } from "../shared/oo-request.ts";

import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { createRetryingFetcher } from "../../shared/retrying-fetcher.ts";
import { createInsufficientCreditError } from "../shared/billing.ts";
import { requestOo, requestOoResponse } from "../shared/oo-request.ts";

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
    status: z.enum(["unverified", "pending", "active", "error"]),
    message: z.string().nullable(),
    // The TXT record that proves ownership of the domain. Optional, like
    // `verified_at`, so a service without ownership verification still parses.
    verification: z.object({ type: z.string(), name: z.string(), value: z.string() }).optional(),
    dns: z.object({ type: z.string(), name: z.string(), value: z.string() }),
    created_at: z.number(),
    verified_at: z.number().nullable().optional(),
    checked_at: z.number().nullable(),
});

// Every website is charged monthly from the team balance. A team that cannot
// pay gets its website suspended, and deleted once `grace_ends_at` passes.
const billingSchema = z.object({
    status: z.enum(["active", "suspended"]),
    // `null` while suspended: the next period starts when the website resumes.
    next_charge_at: z.number().nullable(),
    suspended_at: z.number().nullable(),
    grace_ends_at: z.number().nullable(),
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
    // Absent on a service version that predates billing.
    billing: billingSchema.optional(),
    // The visit report of the website. `null` until the first deployment is
    // live and the report is provisioned; absent on a service version that
    // predates analytics.
    analytics: z.object({ website_id: z.string(), report_url: z.string() }).nullable().optional(),
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

interface WebsitesApiCall {
    /** JSON body; its presence makes the request a POST. */
    body?: unknown;
    /** Reused across runs by callers that journal an attempt; fresh otherwise. */
    idempotencyKey?: string;
    /** Only for requests that are neither a plain read nor a POST with a body. */
    method?: "DELETE" | "POST";
    path: string;
    query?: Record<string, string>;
    /**
     * `false` leaves retrying to the CLI-wide fetcher instead of adding this
     * client's own retries on top. For a read that is expensive for the
     * service and that the caller can simply run again.
     */
    retry?: boolean;
}

interface WebsitesApiRequest<Value> extends WebsitesApiCall {
    schema: z.ZodType<Value>;
}

export async function requestWebsitesApi<Value>(
    target: WebsitesApiTarget,
    context: WebsiteRequestContext,
    request: WebsitesApiRequest<Value>,
): Promise<Value> {
    return await requestOo({ ...websitesApiOptions(target, context, request), schema: request.schema });
}

// For the calls the service answers without a body (204).
export async function sendWebsitesApi(
    target: WebsitesApiTarget,
    context: WebsiteRequestContext,
    request: WebsitesApiCall,
): Promise<void> {
    await requestOoResponse(websitesApiOptions(target, context, request));
}

function websitesApiOptions(target: WebsitesApiTarget, context: WebsiteRequestContext, request: WebsitesApiCall) {
    const method = request.method ?? (request.body === undefined ? "GET" : "POST");

    return {
        authorization: target.account.apiKey,
        context: {
            fetcher: request.retry === false
                ? context.fetcher
                : createRetryingFetcher({
                        fetcher: context.fetcher,
                        logger: context.logger,
                        retryableStatusCodes,
                    }),
            logger: context.logger,
            translator: context.translator,
        },
        errors: { scope: "websiteManaged" },
        headers: method === "POST"
            ? { ...target.headers, "Idempotency-Key": request.idempotencyKey ?? randomUUIDv7() }
            : target.headers,
        host: { endpoint: target.account.endpoint, service: "websites-api" },
        jsonBody: request.body,
        label: "Managed website",
        method,
        path: request.path,
        query: request.query,
        statusErrors: mapWebsitesApiError,
    } as const;
}

// Service codes whose remedy is not obvious from the service message alone.
const serviceErrorKeys: Record<string, string> = {
    analytics_not_ready: "errors.websiteManaged.analyticsNotReady",
    analytics_unavailable: "errors.websiteManaged.analyticsUnavailable",
    manager_required: "errors.websiteManaged.managerRequired",
    website_busy: "errors.websiteManaged.busy",
    website_limit_reached: "errors.websiteManaged.limitReached",
    website_not_suspended: "errors.websiteManaged.notSuspended",
    website_suspended: "errors.websiteManaged.suspended",
};

// The service reports every failure as `{ message, code }`. The message is
// meant for people (for a rejected deployment it carries Cloudflare's reason),
// so it is shown as is unless the code has a remedy worth spelling out; the
// code stays available to scripts in the details either way.
function mapWebsitesApiError(failure: OoRequestFailure): CliUserError | undefined {
    const parsed = parseServiceError(failure.bodyText);

    if (parsed === undefined) {
        return undefined;
    }

    const details = { httpStatus: failure.status, serviceCode: parsed.code };

    // The team cannot pay for a website: the same condition, exit code and
    // billing link as every other balance failure of the CLI.
    if (parsed.code === "insufficient_balance") {
        return createInsufficientCreditError(details);
    }

    const key = serviceErrorKeys[parsed.code];

    if (key !== undefined) {
        return new CliUserError(key, 1, undefined, { details });
    }

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
