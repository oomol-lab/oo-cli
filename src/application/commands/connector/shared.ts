import type { CliExecutionContext } from "../../contracts/cli.ts";

import type { ConnectorIdentity } from "./identity.ts";
import type { ConnectorRequestTarget } from "./target.ts";
import { Buffer } from "node:buffer";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { withRequestTarget } from "../../logging/log-fields.ts";
import {
    createInsufficientCreditError,
    isInsufficientCreditFailure,
} from "../shared/billing.ts";
import {
    getUnexpectedRequestErrorMessage,
    isNetworkRestrictedSandboxError,
    requestText,
} from "../shared/request.ts";
import { connectorIdentityHeaders } from "./identity.ts";

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
    followUpActions: z.unknown().optional(),
    id: z.string().optional(),
    providerPermissions: z.array(z.string()).optional().default([]),
    requiredScopes: z.array(z.string()).optional().default([]),
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

const connectorAppsByServiceResponseSchema = z.object({
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

export const connectorFormatValues = ["json"] as const;

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

export type ConnectorActionDefinition = z.output<typeof connectorActionDefinitionSchema>;
export type ConnectorActionSearchResult = z.output<typeof connectorActionSearchResultSchema>;
export type ConnectorActionAsyncLifecycle = z.output<typeof connectorActionAsyncLifecycleSchema>;
export type ConnectorActionMetadata = z.output<typeof connectorActionMetadataSchema>;
export type ConnectorActionRunResponse = z.output<typeof connectorActionRunResponseSchema>;
export type ConnectorAppView = z.output<typeof connectorAppViewSchema>;
export type ConnectorProxyResponse = z.output<typeof connectorProxyResponseSchema>;
type ConnectorActionFailureResponse = z.output<typeof connectorActionFailureResponseSchema>;

export async function searchConnectorActions(
    options: {
        target: ConnectorRequestTarget;
        text: string;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<ConnectorActionSearchResult[]> {
    const requestUrl = new URL(
        `${options.target.baseUrl}/v1/actions/search`,
    );

    requestUrl.searchParams.set("q", options.text);

    const rawResponse = await requestText({
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.connectorSearch.requestFailed",
            1,
            {
                status,
            },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.connectorSearch.requestError",
            1,
            {
                message: createConnectorUnexpectedErrorMessage(
                    error,
                    options.target,
                    context.translator,
                ),
            },
        ),
        fields: {
            start: {
                textLength: options.text.length,
            },
        },
        init: {
            headers: connectorAuthorizationHeaders(options.target),
        },
        requestLabel: "Connector action search",
        requestUrl,
    });

    try {
        return connectorActionSearchResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        ).data;
    }
    catch {
        throw new CliUserError("errors.connectorSearch.invalidResponse", 1);
    }
}

export async function listConnectorAppsByService(
    options: {
        serviceName: string;
        target: ConnectorRequestTarget;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<ConnectorAppView[]> {
    const requestUrl = new URL(
        `${options.target.baseUrl}/v1/apps/services/${encodeURIComponent(options.serviceName)}`,
    );

    const rawResponse = await requestText({
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.connectorApps.requestFailed",
            1,
            {
                status,
            },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.connectorApps.requestError",
            1,
            {
                message: createConnectorUnexpectedErrorMessage(
                    error,
                    options.target,
                    context.translator,
                ),
            },
        ),
        fields: {
            start: {
                serviceName: options.serviceName,
            },
        },
        init: {
            headers: connectorAuthorizationHeaders(options.target),
        },
        requestLabel: "Connector apps list",
        requestUrl,
    });

    try {
        return connectorAppsByServiceResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        ).data;
    }
    catch {
        throw new CliUserError("errors.connectorApps.invalidResponse", 1);
    }
}

export async function getConnectorActionMetadata(
    options: {
        actionName: string;
        serviceName: string;
        target: ConnectorRequestTarget;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<ConnectorActionMetadata> {
    const requestUrl = createConnectorActionRequestUrl(
        options.target.baseUrl,
        options.serviceName,
        options.actionName,
    );
    const rawResponse = await requestText({
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.connectorMetadata.requestFailed",
            1,
            {
                status,
            },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.connectorMetadata.requestError",
            1,
            {
                message: createConnectorUnexpectedErrorMessage(
                    error,
                    options.target,
                    context.translator,
                ),
            },
        ),
        fields: {
            start: {
                actionName: options.actionName,
                serviceName: options.serviceName,
            },
        },
        init: {
            headers: connectorAuthorizationHeaders(options.target),
        },
        requestLabel: "Connector action metadata",
        requestUrl,
    });

    try {
        return connectorActionMetadataResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        ).data;
    }
    catch {
        throw new CliUserError("errors.connectorMetadata.invalidResponse", 1);
    }
}

export async function runConnectorAction(
    options: {
        actionName: string;
        connectionSelector?: ConnectorConnectionSelector;
        identity?: ConnectorIdentity;
        inputData: unknown;
        serviceName: string;
        target: ConnectorRequestTarget;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<ConnectorActionRunResponse> {
    const requestUrl = createConnectorActionRequestUrl(
        options.target.baseUrl,
        options.serviceName,
        options.actionName,
    );
    const requestBody = JSON.stringify({
        input: options.inputData,
    });
    const requestStartedAt = Date.now();

    context.logger.debug(
        {
            ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            actionName: options.actionName,
            bodyLength: requestBody.length,
            method: "POST",
            serviceName: options.serviceName,
        },
        "Connector action run request started.",
    );

    let rawResponse: string;

    try {
        const response = await context.fetcher(requestUrl, {
            body: requestBody,
            headers: {
                ...connectorAuthorizationHeaders(options.target),
                "Content-Type": "application/json",
                ...connectorConnectionSelectorHeaders(options.connectionSelector),
                ...connectorIdentityHeaders(options.identity),
            },
            method: "POST",
        });
        const durationMs = Date.now() - requestStartedAt;

        rawResponse = await response.text();

        if (!response.ok) {
            const failureResponse = parseConnectorFailureResponse(rawResponse);
            const responseDiagnostics = collectSafeConnectorFailureDiagnostics(
                response,
                rawResponse,
                failureResponse,
            );

            context.logger.warn(
                {
                    ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                    ...responseDiagnostics,
                    actionName: options.actionName,
                    durationMs,
                    errorCode: failureResponse?.errorCode,
                    executionId: failureResponse?.meta?.executionId,
                    method: "POST",
                    responseMessage: sanitizeConnectorFailureMessage(
                        failureResponse?.message,
                    ),
                    serviceName: options.serviceName,
                    status: response.status,
                },
                "Connector action run request returned a non-success status.",
            );

            throw createConnectorRunRequestFailedError({
                actionName: options.actionName,
                failureResponse,
                rawResponse,
                status: response.status,
            });
        }

        context.logger.debug(
            {
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                actionName: options.actionName,
                durationMs,
                method: "POST",
                serviceName: options.serviceName,
                status: response.status,
            },
            "Connector action run request completed.",
        );
    }
    catch (error) {
        if (error instanceof CliUserError) {
            throw error;
        }

        context.logger.warn(
            {
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                actionName: options.actionName,
                durationMs: Date.now() - requestStartedAt,
                err: error,
                method: "POST",
                serviceName: options.serviceName,
            },
            "Connector action run request failed unexpectedly.",
        );

        throw new CliUserError("errors.connectorRun.requestError", 1, {
            message: createConnectorPostUnexpectedErrorMessage(
                error,
                options.target,
                context.translator,
            ),
        });
    }

    try {
        return connectorActionRunResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        );
    }
    catch {
        throw new CliUserError("errors.connectorRun.invalidResponse", 1);
    }
}

export async function runConnectorProxy(
    options: {
        identity?: ConnectorIdentity;
        proxyRequest: unknown;
        serviceName: string;
        target: ConnectorRequestTarget;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<ConnectorProxyResponse> {
    const requestUrl = createConnectorProxyRequestUrl(
        options.target.baseUrl,
        options.serviceName,
    );
    const requestBody = JSON.stringify(options.proxyRequest);
    const requestStartedAt = Date.now();

    context.logger.debug(
        {
            ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            bodyLength: requestBody.length,
            method: "POST",
            serviceName: options.serviceName,
        },
        "Connector proxy request started.",
    );

    let rawResponse: string;

    try {
        const response = await context.fetcher(requestUrl, {
            body: requestBody,
            headers: {
                ...connectorAuthorizationHeaders(options.target),
                "Content-Type": "application/json",
                ...connectorIdentityHeaders(options.identity),
            },
            method: "POST",
        });
        const durationMs = Date.now() - requestStartedAt;

        rawResponse = await response.text();

        if (!response.ok) {
            const failureResponse = parseConnectorFailureResponse(rawResponse);
            const responseDiagnostics = collectSafeConnectorFailureDiagnostics(
                response,
                rawResponse,
                failureResponse,
            );

            context.logger.warn(
                {
                    ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                    ...responseDiagnostics,
                    durationMs,
                    errorCode: failureResponse?.errorCode,
                    executionId: failureResponse?.meta?.executionId,
                    method: "POST",
                    responseMessage: sanitizeConnectorFailureMessage(
                        failureResponse?.message,
                    ),
                    serviceName: options.serviceName,
                    status: response.status,
                },
                "Connector proxy request returned a non-success status.",
            );

            throw createConnectorProxyRequestFailedError({
                failureResponse,
                rawResponse,
                serviceName: options.serviceName,
                status: response.status,
            });
        }

        context.logger.debug(
            {
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                durationMs,
                method: "POST",
                serviceName: options.serviceName,
                status: response.status,
            },
            "Connector proxy request completed.",
        );
    }
    catch (error) {
        if (error instanceof CliUserError) {
            throw error;
        }

        context.logger.warn(
            {
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                durationMs: Date.now() - requestStartedAt,
                err: error,
                method: "POST",
                serviceName: options.serviceName,
            },
            "Connector proxy request failed unexpectedly.",
        );

        throw new CliUserError("errors.connectorProxy.requestError", 1, {
            message: createConnectorPostUnexpectedErrorMessage(
                error,
                options.target,
                context.translator,
            ),
        });
    }

    try {
        return connectorProxyResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        );
    }
    catch {
        throw new CliUserError("errors.connectorProxy.invalidResponse", 1);
    }
}

// Request URLs are built by string concatenation on the normalized base URL
// (never `new URL(path, base)`) so a self-hosted server behind a path prefix
// keeps that prefix.
function createConnectorActionRequestUrl(
    baseUrl: string,
    serviceName: string,
    actionName: string,
): URL {
    const qualifiedActionName
        = `${encodeURIComponent(serviceName)}.${encodeURIComponent(actionName)}`;

    return new URL(
        `${baseUrl}/v1/actions/${qualifiedActionName}`,
    );
}

function createConnectorProxyRequestUrl(
    baseUrl: string,
    serviceName: string,
): URL {
    return new URL(
        `${baseUrl}/v1/proxy/${encodeURIComponent(serviceName)}`,
    );
}

function connectorAuthorizationHeaders(
    target: Pick<ConnectorRequestTarget, "authorization">,
): Record<string, string> {
    if (target.authorization === undefined) {
        return {};
    }

    return { Authorization: target.authorization };
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

// For GET-style calls routed through the shared request layer, which already
// enhanced sandbox network errors with the hint — the message is used as-is.
function createConnectorUnexpectedErrorMessage(
    error: unknown,
    target: Pick<ConnectorRequestTarget, "baseUrl" | "kind">,
    translator: Pick<CliExecutionContext["translator"], "t">,
): string {
    return selfHostedConnectorUnreachableMessage(error, target, translator)
        ?? (error instanceof Error ? error.message : String(error));
}

// For the direct-fetch POST paths (run/proxy), which see the raw fetch error
// and still need the sandbox hint appended for OOMOL targets.
function createConnectorPostUnexpectedErrorMessage(
    error: unknown,
    target: Pick<ConnectorRequestTarget, "baseUrl" | "kind">,
    translator: Pick<CliExecutionContext["translator"], "t">,
): string {
    return selfHostedConnectorUnreachableMessage(error, target, translator)
        ?? getUnexpectedRequestErrorMessage(error, translator);
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

function createConnectorProxyRequestFailedError(input: {
    failureResponse: ConnectorActionFailureResponse | undefined;
    rawResponse: string;
    serviceName: string;
    status: number;
}): CliUserError {
    const responseMessage = input.failureResponse?.message;
    const errorCode = input.failureResponse?.errorCode;

    if (isInsufficientCreditFailure({
        errorCode,
        message: responseMessage,
        status: input.status,
    })) {
        return createInsufficientCreditError();
    }

    if (responseMessage !== undefined && responseMessage !== "") {
        if (errorCode !== undefined && errorCode !== "") {
            return new CliUserError("errors.connectorProxy.requestFailedWithMessageAndCode", 1, {
                errorCode,
                message: responseMessage,
                service: input.serviceName,
                status: input.status,
            });
        }

        return new CliUserError("errors.connectorProxy.requestFailedWithMessage", 1, {
            message: responseMessage,
            service: input.serviceName,
            status: input.status,
        });
    }

    if (errorCode !== undefined && errorCode !== "") {
        return new CliUserError("errors.connectorProxy.requestFailedWithCode", 1, {
            errorCode,
            service: input.serviceName,
            status: input.status,
        });
    }

    const responseBody = createConnectorFailureBodyPreview(input.rawResponse);
    if (responseBody !== undefined) {
        return new CliUserError("errors.connectorProxy.requestFailedWithBody", 1, {
            body: responseBody,
            service: input.serviceName,
            status: input.status,
        });
    }

    return new CliUserError("errors.connectorProxy.requestFailed", 1, {
        service: input.serviceName,
        status: input.status,
    });
}

function createConnectorRunRequestFailedError(options: {
    actionName: string;
    failureResponse: ConnectorActionFailureResponse | undefined;
    rawResponse: string;
    status: number;
}): CliUserError {
    const responseMessage = options.failureResponse?.message;
    const errorCode = options.failureResponse?.errorCode;

    if (isInsufficientCreditFailure({
        errorCode,
        message: responseMessage,
        status: options.status,
    })) {
        return createInsufficientCreditError();
    }

    if (responseMessage !== undefined && responseMessage !== "") {
        if (errorCode !== undefined && errorCode !== "") {
            return new CliUserError(
                "errors.connectorRun.requestFailedWithMessageAndCode",
                1,
                {
                    action: options.actionName,
                    errorCode,
                    message: responseMessage,
                    status: options.status,
                },
            );
        }

        return new CliUserError(
            "errors.connectorRun.requestFailedWithMessage",
            1,
            {
                action: options.actionName,
                message: responseMessage,
                status: options.status,
            },
        );
    }

    if (errorCode !== undefined && errorCode !== "") {
        return new CliUserError(
            "errors.connectorRun.requestFailedWithCode",
            1,
            {
                action: options.actionName,
                errorCode,
                status: options.status,
            },
        );
    }

    const responseBody = createConnectorFailureBodyPreview(options.rawResponse);
    if (responseBody !== undefined) {
        return new CliUserError(
            "errors.connectorRun.requestFailedWithBody",
            1,
            {
                action: options.actionName,
                body: responseBody,
                status: options.status,
            },
        );
    }

    return new CliUserError("errors.connectorRun.requestFailed", 1, {
        action: options.actionName,
        status: options.status,
    });
}
