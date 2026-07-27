import type { MessageKey } from "../../../i18n/catalog.ts";
import type { CliExecutionContext } from "../../contracts/cli.ts";

import { CliUserError } from "../../contracts/cli.ts";
import { withRequestTarget } from "../../logging/log-fields.ts";
import {
    createInsufficientCreditError,
    isInsufficientCreditHttpStatus,
} from "./billing.ts";

type OoRequestContext = Pick<CliExecutionContext, "fetcher" | "logger" | "translator">;
type LogFields = Record<string, unknown>;

export const failedToOpenSocketErrorCode = "FailedToOpenSocket";
export const connectionRefusedErrorCode = "ConnectionRefused";

const networkRestrictedSandboxErrorCodes = [
    failedToOpenSocketErrorCode,
    connectionRefusedErrorCode,
] as const;

type NetworkRestrictedSandboxErrorCode
    = typeof networkRestrictedSandboxErrorCodes[number];

// The service subdomains an oo request may target. The host template
// `https://<service>.<endpoint>` lives in this module only; the one sanctioned
// second site is `llm/config.ts`, whose base URL is itself user-facing output
// and reaches this module as a `{ baseUrl }` host.
type OoService
    = | "api"
        | "cli-api"
        | "fusion-api"
        | "registry"
        | "relation-control"
        | "search";

export type OoRequestHost
    = | { endpoint: string; service: OoService }
        | { baseUrl: string };

type ErrorScopeOf<Key, Suffix extends string>
    = Key extends `errors.${infer Scope}.${Suffix}` ? Scope : never;

// Scopes whose full error triplet exists in the catalog. Derived from the
// catalog keys, so a typo'd scope is a type error rather than a raw key
// leaking into user output.
type OoTripletErrorScope
    = ErrorScopeOf<MessageKey, "requestFailed">
        & ErrorScopeOf<MessageKey, "requestError">
        & ErrorScopeOf<MessageKey, "invalidResponse">;

// Scopes carrying at least the requestFailed/requestError pair — what the raw
// response path needs (`fileDownload` has no invalidResponse key, by design).
// Caveat: `skills.publish` also matches, but its requestFailed template takes
// a {message} param — its caller stays on a hand-rolled path (out of scope).
type OoPairErrorScope
    = ErrorScopeOf<MessageKey, "requestFailed">
        & ErrorScopeOf<MessageKey, "requestError">;

export type OoRequestErrors
    = | { scope: OoTripletErrorScope }
        | { invalidResponse: MessageKey; requestError: MessageKey; requestFailed: MessageKey };

type OoResponseRequestErrors
    = | { scope: OoPairErrorScope }
        | { requestError: MessageKey; requestFailed: MessageKey };

export interface OoRequestFailure {
    /** Non-ok body read before throwing; undefined when the read fails. */
    bodyText: string | undefined;
    /** Headers/status only — the body is already consumed into `bodyText`. */
    response: Response;
    status: number;
}

export interface OoRequestLogFields {
    /** Merged into every log call. */
    common?: LogFields;
    /** Extra warn fields on a non-ok response that will throw. */
    nonSuccess?: (failure: OoRequestFailure) => LogFields;
    start?: LogFields;
    success?: (response: Response) => LogFields;
}

interface OoRequestBaseOptions {
    /** Full header value (raw API key or `Bearer <token>`); absent → no header. */
    authorization?: string;
    context: OoRequestContext;
    /** Extra headers; spread last, so they win over module-set defaults. */
    headers?: Record<string, string>;
    /** Serialized with JSON.stringify and sent with Content-Type: application/json. */
    jsonBody?: unknown;
    /** Log message prefix, e.g. "Variables list" → "Variables list request started." */
    label: string;
    host: OoRequestHost;
    logFields?: OoRequestLogFields;
    /** Defaults to GET. */
    method?: string;
    /** Appended to the host base; caller pre-encodes segments. Omit for full-URL hosts. */
    path?: string;
    /** Array values are appended per item, preserving order. */
    query?: Record<string, string | readonly string[]>;
    /** Status-specific error mapping; undefined falls through to requestFailed. */
    statusErrors?: (failure: OoRequestFailure) => CliUserError | undefined;
    /** Overrides the transport-error message; undefined keeps the hinted default. */
    unexpectedMessage?: (error: unknown) => string | undefined;
}

interface OoRequestOptions<Value> extends OoRequestBaseOptions {
    errors: OoRequestErrors;
    schema: { parse: (input: unknown) => Value };
}

interface OoResponseRequestOptions extends OoRequestBaseOptions {
    /** Statuses that bypass failure handling; the response returns body-unconsumed. */
    allowedStatuses?: readonly number[];
    /** Raw request body; no automatic Content-Type. Not combinable with jsonBody. */
    body?: Bun.BodyInit;
    errors: OoResponseRequestErrors;
}

export type OoProbeResult
    = | { bodyText: string | undefined; kind: "response"; status: number }
        | { kind: "failed" }
        | { kind: "failed_sandbox" };

interface OoProbeOptions {
    authorization?: string;
    context: Pick<CliExecutionContext, "fetcher" | "logger">;
    host: OoRequestHost;
    label: string;
    /** Merged into every log call. */
    logFields?: LogFields;
    path: string;
}

// Performs an oo request and decodes the JSON body against the schema.
// Owns host construction, the auth header, logging, credit detection, the
// sandbox hint (exactly once), and the error-triplet mapping: non-ok →
// requestFailed (or a statusErrors match), transport failures — including a
// body read that dies on an ok response — → requestError, undecodable bodies
// → invalidResponse.
export async function requestOo<Value>(
    options: OoRequestOptions<Value>,
): Promise<Value> {
    const keys = resolveTripletErrorKeys(options.errors);
    const request = prepareOoRequest(options);
    const response = await performOoFetch(options, request, keys, []);

    let bodyText: string;

    try {
        bodyText = await response.text();
    }
    catch (error) {
        throw createOoTransportError(options, request, keys.requestError, error);
    }

    try {
        return options.schema.parse(JSON.parse(bodyText) as unknown);
    }
    catch {
        throw new CliUserError(keys.invalidResponse, 1);
    }
}

// The raw-response variant of requestOo for callers that stream, ignore, or
// hand-parse the body. The response comes back with its body unconsumed;
// statuses in allowedStatuses skip failure handling entirely.
export async function requestOoResponse(
    options: OoResponseRequestOptions,
): Promise<Response> {
    return await performOoFetch(
        options,
        prepareOoRequest(options),
        resolvePairErrorKeys(options.errors),
        options.allowedStatuses ?? [],
    );
}

// The never-throw variant for diagnostic probes: any response comes back as a
// status plus best-effort body text (a failed body read keeps the status), and
// thrown fetch errors classify as failed / failed_sandbox. Callers own the
// interpretation of both status and body.
export async function probeOo(options: OoProbeOptions): Promise<OoProbeResult> {
    const requestUrl = buildOoRequestUrl(options);
    const baseFields = {
        method: "GET",
        ...withRequestTarget(requestUrl.host, requestUrl.pathname),
        ...options.logFields,
    };
    const requestStartedAt = Date.now();

    options.context.logger.debug(baseFields, `${options.label} request started.`);

    try {
        const response = await options.context.fetcher(requestUrl, {
            headers: options.authorization === undefined
                ? {}
                : { Authorization: options.authorization },
        });
        const bodyText = await readBodyTextSafely(response);

        options.context.logger.debug(
            {
                durationMs: Date.now() - requestStartedAt,
                ...baseFields,
                status: response.status,
            },
            `${options.label} request completed.`,
        );

        return { bodyText, kind: "response", status: response.status };
    }
    catch (error) {
        options.context.logger.warn(
            {
                durationMs: Date.now() - requestStartedAt,
                err: error,
                ...baseFields,
            },
            `${options.label} request failed unexpectedly.`,
        );

        return {
            kind: isNetworkRestrictedSandboxError(error) ? "failed_sandbox" : "failed",
        };
    }
}

export function getUnexpectedRequestErrorMessage(
    error: unknown,
    translator: Pick<CliExecutionContext["translator"], "t">,
): string {
    const baseMessage = error instanceof Error ? error.message : String(error);

    if (!isNetworkRestrictedSandboxError(error)) {
        return baseMessage;
    }

    return `${baseMessage}\n${translator.t("errors.shared.networkRestrictedSandboxHint")}`;
}

export function isNetworkRestrictedSandboxError(
    error: unknown,
): error is Error & { code: NetworkRestrictedSandboxErrorCode } {
    return error instanceof Error
        && "code" in error
        && typeof error.code === "string"
        && (networkRestrictedSandboxErrorCodes as readonly string[]).includes(error.code);
}

interface PreparedOoRequest {
    baseFields: LogFields;
    body: Bun.BodyInit | undefined;
    commonFields: LogFields;
    method: string;
    requestInit: RequestInit;
    requestStartedAt: number;
    requestUrl: URL;
}

interface FetchingOptions extends OoRequestBaseOptions {
    body?: Bun.BodyInit;
    errors: OoRequestErrors | OoResponseRequestErrors;
}

function prepareOoRequest(options: FetchingOptions): PreparedOoRequest {
    if (options.jsonBody !== undefined && options.body !== undefined) {
        throw new TypeError("jsonBody and body are mutually exclusive");
    }

    const requestUrl = buildOoRequestUrl(options);
    const method = options.method ?? "GET";
    const headers: Record<string, string> = {};

    if (options.authorization !== undefined) {
        headers.Authorization = options.authorization;
    }

    let body: Bun.BodyInit | undefined = options.body;
    let bodyLength: number | undefined = measureRawBodyLength(options.body);

    if (options.jsonBody !== undefined) {
        const serialized = JSON.stringify(options.jsonBody);

        body = serialized;
        bodyLength = serialized.length;
        headers["Content-Type"] = "application/json";
    }

    Object.assign(headers, options.headers);

    const baseFields: LogFields = {
        method,
        ...withRequestTarget(requestUrl.host, requestUrl.pathname),
    };
    const commonFields = options.logFields?.common ?? {};
    const startFields: LogFields = {
        ...baseFields,
        ...(bodyLength === undefined ? {} : { bodyLength }),
        ...commonFields,
        ...options.logFields?.start,
    };

    options.context.logger.debug(startFields, `${options.label} request started.`);

    return {
        baseFields,
        body,
        commonFields,
        method,
        requestInit: { body, headers, method },
        requestStartedAt: Date.now(),
        requestUrl,
    };
}

async function performOoFetch(
    options: FetchingOptions,
    request: PreparedOoRequest,
    keys: { requestError: string; requestFailed: string },
    allowedStatuses: readonly number[],
): Promise<Response> {
    let response: Response;

    try {
        response = await options.context.fetcher(request.requestUrl, request.requestInit);
    }
    catch (error) {
        throw createOoTransportError(options, request, keys.requestError, error);
    }

    const status = response.status;
    const durationMs = Date.now() - request.requestStartedAt;

    if (!response.ok && !allowedStatuses.includes(status)) {
        const failure: OoRequestFailure = {
            bodyText: await readBodyTextSafely(response),
            response,
            status,
        };

        options.context.logger.warn(
            {
                durationMs,
                ...request.baseFields,
                ...request.commonFields,
                ...options.logFields?.nonSuccess?.(failure),
                status,
            },
            `${options.label} request returned a non-success status.`,
        );

        if (isInsufficientCreditHttpStatus(status)) {
            throw createInsufficientCreditError();
        }

        throw options.statusErrors?.(failure)
            ?? new CliUserError(keys.requestFailed, 1, { status });
    }

    options.context.logger.debug(
        {
            durationMs,
            ...request.baseFields,
            ...request.commonFields,
            ...options.logFields?.success?.(response),
            status,
        },
        `${options.label} request completed.`,
    );

    return response;
}

function createOoTransportError(
    options: FetchingOptions,
    request: PreparedOoRequest,
    requestErrorKey: string,
    error: unknown,
): CliUserError {
    options.context.logger.warn(
        {
            durationMs: Date.now() - request.requestStartedAt,
            err: error,
            ...request.baseFields,
            ...request.commonFields,
        },
        `${options.label} request failed unexpectedly.`,
    );

    const message = options.unexpectedMessage?.(error)
        ?? getUnexpectedRequestErrorMessage(error, options.context.translator);

    return new CliUserError(requestErrorKey, 1, { message });
}

function buildOoRequestUrl(
    options: Pick<OoRequestBaseOptions, "host" | "path" | "query">,
): URL {
    const base = "baseUrl" in options.host
        ? options.host.baseUrl
        : `https://${options.host.service}.${options.host.endpoint}`;
    // Concatenation (never `new URL(path, base)`) so a base URL behind a path
    // prefix keeps that prefix, and a full-URL host keeps its embedded query.
    const requestUrl = new URL(`${base}${options.path ?? ""}`);

    for (const [name, value] of Object.entries(options.query ?? {})) {
        if (typeof value === "string") {
            requestUrl.searchParams.set(name, value);
        }
        else {
            for (const item of value) {
                requestUrl.searchParams.append(name, item);
            }
        }
    }

    return requestUrl;
}

function resolveTripletErrorKeys(errors: OoRequestErrors): {
    invalidResponse: string;
    requestError: string;
    requestFailed: string;
} {
    if ("scope" in errors) {
        return {
            invalidResponse: `errors.${errors.scope}.invalidResponse`,
            ...resolvePairErrorKeys({ scope: errors.scope }),
        };
    }

    return errors;
}

// The only place the scope -> requestFailed/requestError key templates exist.
function resolvePairErrorKeys(errors: OoResponseRequestErrors): {
    requestError: string;
    requestFailed: string;
} {
    if ("scope" in errors) {
        return {
            requestError: `errors.${errors.scope}.requestError`,
            requestFailed: `errors.${errors.scope}.requestFailed`,
        };
    }

    return errors;
}

async function readBodyTextSafely(response: Response): Promise<string | undefined> {
    try {
        return await response.text();
    }
    catch {
        return undefined;
    }
}

function measureRawBodyLength(body: Bun.BodyInit | undefined): number | undefined {
    if (typeof body === "string") {
        return body.length;
    }

    if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
        return body.byteLength;
    }

    return undefined;
}
