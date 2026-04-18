import type { CliExecutionContext } from "../../contracts/cli.ts";

import { CliUserError } from "../../contracts/cli.ts";
import { withRequestTarget } from "../../logging/log-fields.ts";

type RequestContext = Pick<CliExecutionContext, "fetcher" | "logger" | "translator">;
type LogFields = Record<string, unknown>;
type LogFieldsResolver<TValue> = LogFields | ((input: TValue) => LogFields);

export const failedToOpenSocketErrorCode = "FailedToOpenSocket";
export const connectionRefusedErrorCode = "ConnectionRefused";

const networkRestrictedSandboxErrorCodes = [
    failedToOpenSocketErrorCode,
    connectionRefusedErrorCode,
] as const;

type NetworkRestrictedSandboxErrorCode
    = typeof networkRestrictedSandboxErrorCodes[number];

interface ExecuteCliRequestOptions {
    allowedStatusCodes?: readonly number[];
    context: RequestContext;
    createRequestError: (error: unknown) => CliUserError;
    createRequestFailedError: (status: number) => CliUserError;
    includeMethod?: boolean;
    includeRequestTarget?: boolean;
    init?: RequestInit;
    label: string;
    nonSuccessLogFields?: LogFieldsResolver<Response>;
    requestUrl: URL;
    startLogFields?: LogFields;
    successLogFields?: LogFieldsResolver<Response>;
    unexpectedLogFields?: LogFieldsResolver<unknown>;
}

export interface PerformLoggedRequestOptions {
    allowedStatuses?: readonly number[];
    context: RequestContext;
    createRequestFailedError: (status: number) => CliUserError;
    createUnexpectedError: (error: unknown) => CliUserError;
    fields?: {
        common?: LogFields;
        error?: LogFieldsResolver<unknown>;
        response?: LogFieldsResolver<Response>;
        start?: LogFields;
        success?: LogFieldsResolver<Response>;
    };
    init?: RequestInit;
    requestLabel: string;
    requestUrl: URL;
}

export async function executeCliRequest(
    options: ExecuteCliRequestOptions,
): Promise<Response> {
    const requestStartedAt = Date.now();
    const method = options.init?.method ?? "GET";

    options.context.logger.debug(
        {
            ...createBaseLogFields(options.requestUrl, method, options),
            ...options.startLogFields,
        },
        `${options.label} request started.`,
    );

    try {
        const response = await options.context.fetcher(
            options.requestUrl,
            options.init,
        );
        const durationMs = Date.now() - requestStartedAt;

        if (
            !response.ok
            && !(options.allowedStatusCodes ?? []).includes(response.status)
        ) {
            options.context.logger.warn(
                {
                    durationMs,
                    ...createBaseLogFields(options.requestUrl, method, options),
                    ...resolveLogFields(options.nonSuccessLogFields, response),
                    status: response.status,
                },
                `${options.label} request returned a non-success status.`,
            );
            throw options.createRequestFailedError(response.status);
        }

        options.context.logger.debug(
            {
                durationMs,
                ...createBaseLogFields(options.requestUrl, method, options),
                ...resolveLogFields(options.successLogFields, response),
                status: response.status,
            },
            `${options.label} request completed.`,
        );

        return response;
    }
    catch (error) {
        if (error instanceof CliUserError) {
            throw error;
        }

        options.context.logger.warn(
            {
                durationMs: Date.now() - requestStartedAt,
                err: error,
                ...createBaseLogFields(options.requestUrl, method, options),
                ...resolveLogFields(options.unexpectedLogFields, error),
            },
            `${options.label} request failed unexpectedly.`,
        );
        throw options.createRequestError(
            enhanceUnexpectedRequestError(
                error,
                options.context.translator,
            ),
        );
    }
}

function createBaseLogFields(
    requestUrl: URL,
    method: string,
    options: Pick<ExecuteCliRequestOptions, "includeMethod" | "includeRequestTarget">,
): LogFields {
    const fields: LogFields = {};

    if (options.includeMethod === true) {
        fields.method = method;
    }

    if (options.includeRequestTarget !== false) {
        Object.assign(fields, withRequestTarget(requestUrl.host, requestUrl.pathname));
    }

    return fields;
}

function resolveLogFields<TValue>(
    value: LogFieldsResolver<TValue> | undefined,
    input: TValue,
): LogFields {
    if (typeof value === "function") {
        return value(input);
    }

    return value ?? {};
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

function enhanceUnexpectedRequestError(
    error: unknown,
    translator: Pick<CliExecutionContext["translator"], "t">,
): unknown {
    if (!isNetworkRestrictedSandboxError(error)) {
        return error;
    }

    const enhanced = new Error(getUnexpectedRequestErrorMessage(error, translator)) as
        Error & { code: NetworkRestrictedSandboxErrorCode };

    enhanced.code = error.code;
    enhanced.stack = error.stack;

    return enhanced;
}

export function isNetworkRestrictedSandboxError(
    error: unknown,
): error is Error & { code: NetworkRestrictedSandboxErrorCode } {
    return error instanceof Error
        && "code" in error
        && typeof error.code === "string"
        && (networkRestrictedSandboxErrorCodes as readonly string[]).includes(error.code);
}

export async function performLoggedRequest(
    options: PerformLoggedRequestOptions,
): Promise<Response> {
    return await executeCliRequest({
        allowedStatusCodes: options.allowedStatuses,
        context: options.context,
        createRequestError: options.createUnexpectedError,
        createRequestFailedError: options.createRequestFailedError,
        label: options.requestLabel,
        nonSuccessLogFields: response => ({
            ...(options.fields?.common ?? {}),
            ...resolveLogFields(options.fields?.response, response),
        }),
        requestUrl: options.requestUrl,
        startLogFields: {
            ...(options.fields?.common ?? {}),
            ...(options.fields?.start ?? {}),
        },
        successLogFields: response => ({
            ...(options.fields?.common ?? {}),
            ...resolveLogFields(options.fields?.response, response),
            ...resolveLogFields(options.fields?.success, response),
        }),
        unexpectedLogFields: error => ({
            ...(options.fields?.common ?? {}),
            ...resolveLogFields(options.fields?.error, error),
        }),
        init: options.init,
    });
}

export async function requestText(
    options: PerformLoggedRequestOptions,
): Promise<string> {
    const response = await performLoggedRequest(options);

    return await response.text();
}
