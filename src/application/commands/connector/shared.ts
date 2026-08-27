import type { CliExecutionContext } from "../../contracts/cli.ts";

import type { OoRequestFailure } from "../shared/oo-request.ts";
import type { TeamIdentity } from "../team/identity.ts";
import type { ConnectorRequestTarget } from "./target.ts";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import {
    createInsufficientCreditError,
    isInsufficientCreditFailure,
} from "../shared/billing.ts";
import {
    isNetworkRestrictedSandboxError,
    requestOo,
} from "../shared/oo-request.ts";
import { teamIdentityHeaders } from "../team/identity.ts";

export const connectorActionDefinitionSchema = z.object({
    description: z.string().optional().default(""),
    inputSchema: z.unknown(),
    name: z.string().min(1),
    outputSchema: z.unknown(),
    service: z.string().min(1),
});

const connectorActionAsyncLifecycleSubmitSchema = z.object({
    role: z.literal("submit"),
    resultAction: z.string().min(1),
    handle: z.object({
        inputField: z.string().min(1),
        outputField: z.string().min(1),
    }),
});

const connectorActionAsyncLifecycleResultSchema = z.object({
    role: z.literal("result"),
    wait: z.object({
        intervalSeconds: z.number().positive(),
        resultField: z.string().min(1).optional(),
        state: z.object({
            failure: z.array(z.string()),
            field: z.string().min(1),
            running: z.array(z.string()),
            success: z.array(z.string()),
        }),
    }),
});

export const connectorActionAsyncLifecycleSchema = z.discriminatedUnion("role", [
    connectorActionAsyncLifecycleSubmitSchema,
    connectorActionAsyncLifecycleResultSchema,
]);

// Different connector backends disagree on the async lifecycle contract: the
// OOMOL service returns the submit/result union, while the open-source
// self-hosted runtime returns either `null` or a `{startActionId, ...}` shape
// that carries no polling contract. Anything that does not match the union is
// normalized to `undefined` so plain schema/run flows keep working; the
// `--wait` / `--wait-result` modes then fail with their existing clear
// "unsupported" errors instead of a blanket metadata parse failure.
function normalizeConnectorActionAsyncLifecycle(value: unknown): unknown {
    if (value === undefined || value === null) {
        return undefined;
    }

    return connectorActionAsyncLifecycleSchema.safeParse(value).success
        ? value
        : undefined;
}

export const connectorActionMetadataSchema = connectorActionDefinitionSchema.extend({
    asyncLifecycle: z.preprocess(
        normalizeConnectorActionAsyncLifecycle,
        connectorActionAsyncLifecycleSchema.optional(),
    ),
}).passthrough();

const connectorActionSearchResultSchema = z.object({
    authenticated: z.boolean(),
    description: z.string().optional().default(""),
    inputSchema: z.unknown(),
    name: z.string().min(1),
    outputSchema: z.unknown(),
    service: z.string().min(1),
});

const connectorActionSearchResponseSchema = z.object({
    data: z.array(connectorActionSearchResultSchema).optional().default([]),
});

const connectorActionMetadataResponseSchema = z.object({
    data: connectorActionMetadataSchema,
});

const connectorActionRunResponseSchema = z.object({
    data: z.unknown(),
    meta: z.object({
        executionId: z.string().min(1),
    }).passthrough(),
}).passthrough().transform(({
    message: _message,
    success: _success,
    ...response
}) => response);

const connectorProxyResponseSchema = z.object({
    data: z.object({
        data: z.unknown().optional().default(null),
        headers: z.record(z.string(), z.unknown()).optional().default({}),
        status: z.number().int(),
    }),
    meta: z.object({
        appId: z.string().optional(),
        executionId: z.string().min(1),
        service: z.string().min(1),
    }).passthrough(),
}).passthrough().transform(({
    message: _message,
    success: _success,
    ...response
}) => response);

const connectorAppConnectionNameSchema = z.string().nullable().optional().transform(value => value ?? null);

const connectorAppViewSchema = z.object({
    accountLabel: z.string(),
    // The backend response names this field `alias`; it is the only wire
    // boundary that keeps the legacy name. Everything downstream reads it as
    // `connectionName` via the transform below.
    alias: connectorAppConnectionNameSchema,
    authType: z.string().nullable(),
    displayName: z.string(),
    isDefault: z.boolean(),
    scopes: z.array(z.string()).default([]),
    service: z.string().min(1),
    status: z.string().min(1),
}).passthrough().transform(({ alias, ...rest }) => ({
    ...rest,
    connectionName: alias,
}));

// Both the list-all (`/v1/apps`) and by-service (`/v1/apps/services/{service}`)
// endpoints return the same `{ data: [appView] }` envelope, so a single schema
// covers both. The self-hosted open-source runtime exposes the same `/v1/apps`
// shape, so this parses every connector backend uniformly.
const connectorAppsResponseSchema = z.object({
    data: z.array(connectorAppViewSchema),
});

const connectorActionFailureResponseSchema = z.object({
    // `code` / `error` are accepted as aliases for `errorCode` / `message`
    // because some upstream connector responses use the shorter field names.
    // They are typed as `unknown` so a non-string alias value (e.g. a nested
    // `error` object) does not fail validation and discard the canonical
    // fields; `firstNonEmptyString` filters them down to usable strings.
    code: z.unknown().optional(),
    error: z.unknown().optional(),
    errorCode: z.string().optional(),
    message: z.string().optional(),
    meta: z.object({
        actionId: z.string().optional(),
        executionId: z.string().optional(),
    }).partial().optional(),
}).passthrough();

export interface ConnectorConnectionSelector {
    connectionName?: string;
}

export function requireConnectorActionName(rawAction: string | undefined): string {
    const trimmed = rawAction?.trim();

    if (trimmed === undefined || trimmed === "") {
        throw new CliUserError("errors.connectorRun.actionRequired", 2);
    }

    return trimmed;
}

export type ConnectorActionSearchResult = z.output<typeof connectorActionSearchResultSchema>;
export type ConnectorActionAsyncLifecycle = z.output<typeof connectorActionAsyncLifecycleSchema>;
export type ConnectorActionMetadata = z.output<typeof connectorActionMetadataSchema>;
export type ConnectorActionRunResponse = z.output<typeof connectorActionRunResponseSchema>;
export type ConnectorAppView = z.output<typeof connectorAppViewSchema>;
export type ConnectorProxyResponse = z.output<typeof connectorProxyResponseSchema>;
type ConnectorActionFailureResponse = z.output<typeof connectorActionFailureResponseSchema>;

export async function searchConnectorActions(
    options: {
        identity?: TeamIdentity | undefined;
        target: ConnectorRequestTarget;
        text: string;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<ConnectorActionSearchResult[]> {
    const parsed = await requestOo({
        authorization: options.target.authorization,
        context,
        errors: { scope: "connectorSearch" },
        // The action list itself is identity-independent, but each result's
        // `authenticated` flag reflects the effective identity's connected
        // apps, so the identity headers are forwarded like `apps`/`run`.
        headers: teamIdentityHeaders(options.identity),
        host: { baseUrl: options.target.baseUrl },
        label: "Connector action search",
        logFields: {
            start: {
                textLength: options.text.length,
            },
        },
        path: "/v1/actions/search",
        query: { q: options.text },
        schema: connectorActionSearchResponseSchema,
        unexpectedMessage: error => selfHostedConnectorUnreachableMessage(
            error,
            options.target,
            context.translator,
        ),
    });

    return parsed.data;
}

// Lists every connected app under the effective identity. Backed by
// `GET /v1/apps?status=active`, which the OOMOL service and the open-source
// self-hosted runtime both implement with the same `{ data: [appView] }`
// envelope; the self-hosted runtime simply ignores the `status` filter.
export async function listConnectorApps(
    options: {
        identity?: TeamIdentity | undefined;
        target: ConnectorRequestTarget;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<ConnectorAppView[]> {
    const parsed = await requestOo({
        authorization: options.target.authorization,
        context,
        errors: { scope: "connectorApps" },
        headers: teamIdentityHeaders(options.identity),
        host: { baseUrl: options.target.baseUrl },
        label: "Connector apps list",
        path: "/v1/apps",
        query: { status: "active" },
        schema: connectorAppsResponseSchema,
        unexpectedMessage: error => selfHostedConnectorUnreachableMessage(
            error,
            options.target,
            context.translator,
        ),
    });

    return parsed.data;
}

export async function listConnectorAppsByService(
    options: {
        identity?: TeamIdentity | undefined;
        serviceName: string;
        target: ConnectorRequestTarget;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<ConnectorAppView[]> {
    const parsed = await requestOo({
        authorization: options.target.authorization,
        context,
        errors: { scope: "connectorApps" },
        headers: teamIdentityHeaders(options.identity),
        host: { baseUrl: options.target.baseUrl },
        label: "Connector apps list",
        logFields: {
            start: {
                serviceName: options.serviceName,
            },
        },
        path: `/v1/apps/services/${encodeURIComponent(options.serviceName)}`,
        schema: connectorAppsResponseSchema,
        unexpectedMessage: error => selfHostedConnectorUnreachableMessage(
            error,
            options.target,
            context.translator,
        ),
    });

    return parsed.data;
}

export async function getConnectorActionMetadata(
    options: {
        actionName: string;
        serviceName: string;
        target: ConnectorRequestTarget;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<ConnectorActionMetadata> {
    const parsed = await requestOo({
        // Metadata is identity-independent (the schema cache is deliberately
        // not keyed by org), so no identity headers are forwarded here.
        authorization: options.target.authorization,
        context,
        errors: { scope: "connectorMetadata" },
        host: { baseUrl: options.target.baseUrl },
        label: "Connector action metadata",
        logFields: {
            start: {
                actionName: options.actionName,
                serviceName: options.serviceName,
            },
        },
        path: connectorActionPath(options.serviceName, options.actionName),
        schema: connectorActionMetadataResponseSchema,
        unexpectedMessage: error => selfHostedConnectorUnreachableMessage(
            error,
            options.target,
            context.translator,
        ),
    });

    return parsed.data;
}

// The five requestFailed* keys of one connector POST namespace. The two
// namespaces differ only here and in the subject param, so one ladder serves
// both.
interface ConnectorFailureKeys {
    requestFailed: string;
    requestFailedWithBody: string;
    requestFailedWithCode: string;
    requestFailedWithMessage: string;
    requestFailedWithMessageAndCode: string;
}

const connectorRunFailureKeys: ConnectorFailureKeys = {
    requestFailed: "errors.connectorRun.requestFailed",
    requestFailedWithBody: "errors.connectorRun.requestFailedWithBody",
    requestFailedWithCode: "errors.connectorRun.requestFailedWithCode",
    requestFailedWithMessage: "errors.connectorRun.requestFailedWithMessage",
    requestFailedWithMessageAndCode: "errors.connectorRun.requestFailedWithMessageAndCode",
};

const connectorProxyFailureKeys: ConnectorFailureKeys = {
    requestFailed: "errors.connectorProxy.requestFailed",
    requestFailedWithBody: "errors.connectorProxy.requestFailedWithBody",
    requestFailedWithCode: "errors.connectorProxy.requestFailedWithCode",
    requestFailedWithMessage: "errors.connectorProxy.requestFailedWithMessage",
    requestFailedWithMessageAndCode: "errors.connectorProxy.requestFailedWithMessageAndCode",
};

export async function runConnectorAction(
    options: {
        actionName: string;
        connectionSelector?: ConnectorConnectionSelector;
        identity?: TeamIdentity | undefined;
        inputData: unknown;
        serviceName: string;
        target: ConnectorRequestTarget;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<ConnectorActionRunResponse> {
    return await requestOo({
        authorization: options.target.authorization,
        context,
        errors: { scope: "connectorRun" },
        headers: {
            ...connectorConnectionSelectorHeaders(options.connectionSelector),
            ...teamIdentityHeaders(options.identity),
        },
        host: { baseUrl: options.target.baseUrl },
        jsonBody: { input: options.inputData },
        label: "Connector action run",
        logFields: {
            common: {
                actionName: options.actionName,
                serviceName: options.serviceName,
            },
            nonSuccess: connectorFailureLogFields,
        },
        method: "POST",
        path: connectorActionPath(options.serviceName, options.actionName),
        schema: connectorActionRunResponseSchema,
        statusErrors: failure => createConnectorFailureError({
            failure,
            keys: connectorRunFailureKeys,
            subject: { action: options.actionName },
        }),
        unexpectedMessage: error => selfHostedConnectorUnreachableMessage(
            error,
            options.target,
            context.translator,
        ),
    });
}

export async function runConnectorProxy(
    options: {
        identity?: TeamIdentity | undefined;
        proxyRequest: unknown;
        serviceName: string;
        target: ConnectorRequestTarget;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<ConnectorProxyResponse> {
    return await requestOo({
        authorization: options.target.authorization,
        context,
        errors: { scope: "connectorProxy" },
        headers: teamIdentityHeaders(options.identity),
        host: { baseUrl: options.target.baseUrl },
        jsonBody: options.proxyRequest,
        label: "Connector proxy",
        logFields: {
            common: {
                serviceName: options.serviceName,
            },
            nonSuccess: connectorFailureLogFields,
        },
        method: "POST",
        path: `/v1/proxy/${encodeURIComponent(options.serviceName)}`,
        schema: connectorProxyResponseSchema,
        statusErrors: failure => createConnectorFailureError({
            failure,
            keys: connectorProxyFailureKeys,
            subject: { service: options.serviceName },
        }),
        unexpectedMessage: error => selfHostedConnectorUnreachableMessage(
            error,
            options.target,
            context.translator,
        ),
    });
}

function connectorActionPath(serviceName: string, actionName: string): string {
    return `/v1/actions/${encodeURIComponent(serviceName)}.${encodeURIComponent(actionName)}`;
}

// Self-hosted servers are typically local processes, so a connection failure
// usually means the server is not running — the sandbox hint the OOMOL paths
// use would send users down the wrong path.
function selfHostedConnectorUnreachableMessage(
    error: unknown,
    target: Pick<ConnectorRequestTarget, "baseUrl" | "kind">,
    translator: Pick<CliExecutionContext["translator"], "t">,
): string | undefined {
    if (target.kind === "self_hosted" && isNetworkRestrictedSandboxError(error)) {
        return translator.t("errors.connector.selfHostedUnreachable", {
            url: target.baseUrl,
        });
    }

    return undefined;
}

function connectorConnectionSelectorHeaders(
    selector: ConnectorConnectionSelector | undefined,
): Record<string, string> {
    const headers: Record<string, string> = {};

    // The connection name is sent on the wire as the legacy `x-oo-connector-alias`
    // header; this is the only place the `alias` name survives.
    if (selector?.connectionName !== undefined) {
        headers["x-oo-connector-alias"] = selector.connectionName;
    }

    return headers;
}

function parseConnectorFailureResponse(
    rawResponse: string,
): ConnectorActionFailureResponse | undefined {
    let parsed: ConnectorActionFailureResponse;

    try {
        parsed = connectorActionFailureResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        );
    }
    catch {
        return undefined;
    }

    // Normalize the alias fields so downstream readers only deal with the
    // canonical `message` / `errorCode` shape.
    return {
        ...parsed,
        errorCode: firstNonEmptyString(parsed.errorCode, parsed.code),
        message: firstNonEmptyString(parsed.message, parsed.error),
    };
}

const safeResponseHeaderNames = [
    "x-request-id",
    "x-amzn-requestid",
    "x-amzn-trace-id",
    "x-correlation-id",
    "cf-ray",
    "trace-id",
    "x-trace-id",
] as const;

const rawResponsePreviewMaxLength = 1000;

const responsePreviewWhitespacePattern = /[\r\n\t]/g;
// eslint-disable-next-line no-control-regex
const responsePreviewControlCharsPattern = /[\x00-\x08\x0B-\x1F\x7F]/g;

interface SafeConnectorFailureDiagnostics {
    rawResponsePreview?: string;
    responseBodyLength: number;
    responseContentType?: string;
    responseHeaders?: Record<string, string>;
}

/**
 * Returns safe, bounded diagnostics for a non-success connector response.
 *
 * Always-on fields:
 * - `responseBodyLength` (UTF-8 byte count of the response body)
 * - `responseContentType` (when the response has a `Content-Type` header)
 * - `responseHeaders` (a whitelisted subset of trace / request-id headers)
 *
 * Conditional `rawResponsePreview`:
 * - Only emitted when the structured `connectorActionFailureResponseSchema`
 *   yielded no usable fields (all of `message`, `errorCode`,
 *   `meta.executionId` are absent or empty) AND the body is non-empty.
 * - Bounded to {@link rawResponsePreviewMaxLength} characters with a `...`
 *   marker; CR / LF / tab are folded to spaces and other ASCII control
 *   characters are stripped to keep log output single-line and readable.
 *
 * Why preview is conditional: when the failure body matches the structured
 * schema, `message` / `errorCode` / `executionId` already carry the safe
 * subset of the response. Logging the raw preview anyway would expand the
 * sensitive surface (prompts, signed URLs, payload echoes) without adding
 * diagnostic value.
 */
function collectSafeConnectorFailureDiagnostics(
    response: Response,
    rawResponse: string,
    failureResponse: ConnectorActionFailureResponse | undefined,
): SafeConnectorFailureDiagnostics {
    const diagnostics: SafeConnectorFailureDiagnostics = {
        responseBodyLength: Buffer.byteLength(rawResponse, "utf8"),
    };

    const contentType = response.headers.get("content-type");
    if (contentType !== null && contentType !== "") {
        diagnostics.responseContentType = contentType;
    }

    const responseHeaders: Record<string, string> = {};
    for (const headerName of safeResponseHeaderNames) {
        const value = response.headers.get(headerName);
        if (value !== null && value !== "") {
            responseHeaders[headerName] = value;
        }
    }
    if (Object.keys(responseHeaders).length > 0) {
        diagnostics.responseHeaders = responseHeaders;
    }

    const hasStructuredFailureFields = isNonEmptyString(failureResponse?.message)
        || isNonEmptyString(failureResponse?.errorCode)
        || isNonEmptyString(failureResponse?.meta?.executionId);

    if (rawResponse.length > 0 && !hasStructuredFailureFields) {
        diagnostics.rawResponsePreview = createBoundedResponsePreview(rawResponse);
    }

    return diagnostics;
}

function sanitizeConnectorResponseText(rawResponse: string): string {
    return rawResponse
        .replaceAll(responsePreviewWhitespacePattern, " ")
        .replaceAll(responsePreviewControlCharsPattern, "");
}

function createBoundedResponsePreview(rawResponse: string): string {
    const stripped = sanitizeConnectorResponseText(rawResponse);

    if (stripped.length <= rawResponsePreviewMaxLength) {
        return stripped;
    }

    return `${stripped.slice(0, rawResponsePreviewMaxLength)}...`;
}

const connectorFailureBodyPreviewMaxLength = 500;

/**
 * Builds a user-facing preview of a non-success connector response body.
 *
 * Used as a fallback so the operator who ran the action still sees the raw
 * error detail when the response could not be reduced to a structured
 * `message` / `errorCode`. Control characters are stripped and whitespace is
 * folded to keep the error message single-line; the result is bounded to
 * {@link connectorFailureBodyPreviewMaxLength} characters. Returns `undefined`
 * when the body is empty (or only whitespace) so callers can fall back to a
 * status-only message.
 */
function createConnectorFailureBodyPreview(
    rawResponse: string,
): string | undefined {
    const preview = sanitizeConnectorResponseText(rawResponse).trim();

    if (preview === "") {
        return undefined;
    }

    if (preview.length <= connectorFailureBodyPreviewMaxLength) {
        return preview;
    }

    return `${preview.slice(0, connectorFailureBodyPreviewMaxLength)}...`;
}

function firstNonEmptyString(
    ...values: unknown[]
): string | undefined {
    for (const value of values) {
        if (isNonEmptyString(value)) {
            return value;
        }
    }

    return undefined;
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.length > 0;
}

function sanitizeConnectorFailureMessage(
    message: string | undefined,
): string | undefined {
    if (message === undefined) {
        return undefined;
    }

    const singleLineMessage = message.replaceAll("\r", " ").replaceAll("\n", " ");
    const maxLength = 200;

    if (singleLineMessage.length <= maxLength) {
        return singleLineMessage;
    }

    return `${singleLineMessage.slice(0, maxLength)}...`;
}

// Extra warn-log fields for a failed connector POST: bounded safe diagnostics
// plus the structured failure fields. Parses the failure body independently of
// the error ladder — both parses are pure and cheap.
function connectorFailureLogFields(failure: OoRequestFailure): Record<string, unknown> {
    const rawResponse = failure.bodyText ?? "";
    const failureResponse = parseConnectorFailureResponse(rawResponse);

    return {
        ...collectSafeConnectorFailureDiagnostics(
            failure.response,
            rawResponse,
            failureResponse,
        ),
        errorCode: failureResponse?.errorCode,
        executionId: failureResponse?.meta?.executionId,
        responseMessage: sanitizeConnectorFailureMessage(failureResponse?.message),
    };
}

// The five-branch failure ladder shared by run and proxy: credit detection,
// then message+code / message / code / bounded body preview / status-only.
// Total by construction — every non-success status maps to an error, so the
// generic requestFailed default (which lacks the subject param) is unreachable.
function createConnectorFailureError(input: {
    failure: OoRequestFailure;
    keys: ConnectorFailureKeys;
    subject: Record<string, string>;
}): CliUserError {
    const rawResponse = input.failure.bodyText ?? "";
    const failureResponse = parseConnectorFailureResponse(rawResponse);
    const responseMessage = failureResponse?.message;
    const errorCode = failureResponse?.errorCode;
    const status = input.failure.status;

    if (isInsufficientCreditFailure({
        errorCode,
        message: responseMessage,
        status,
    })) {
        return createInsufficientCreditError();
    }

    if (isNonEmptyString(responseMessage)) {
        if (isNonEmptyString(errorCode)) {
            return new CliUserError(input.keys.requestFailedWithMessageAndCode, 1, {
                ...input.subject,
                errorCode,
                message: responseMessage,
                status,
            });
        }

        return new CliUserError(input.keys.requestFailedWithMessage, 1, {
            ...input.subject,
            message: responseMessage,
            status,
        });
    }

    if (isNonEmptyString(errorCode)) {
        return new CliUserError(input.keys.requestFailedWithCode, 1, {
            ...input.subject,
            errorCode,
            status,
        });
    }

    const responseBody = createConnectorFailureBodyPreview(rawResponse);
    if (responseBody !== undefined) {
        return new CliUserError(input.keys.requestFailedWithBody, 1, {
            ...input.subject,
            body: responseBody,
            status,
        });
    }

    return new CliUserError(input.keys.requestFailed, 1, {
        ...input.subject,
        status,
    });
}
