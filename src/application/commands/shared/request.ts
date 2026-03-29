import type { CliExecutionContext } from "../../contracts/cli.ts";

import { CliUserError } from "../../contracts/cli.ts";
import { withRequestTarget } from "../../logging/log-fields.ts";

type RequestContext = Pick<CliExecutionContext, "fetcher" | "logger">;
type LogFields = Record<string, unknown>;
type LogFieldsResolver<TValue> = LogFields | ((input: TValue) => LogFields);

export interface ExecuteCliRequestOptions {
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
        throw options.createRequestError(error);
    }
}

export async function executeCliTextRequest(
    options: ExecuteCliRequestOptions,
): Promise<string> {
    const response = await executeCliRequest(options);

    return await response.text();
}

function createBaseLogFields(
    requestUrl: URL,
    method: string,
    options: Pick<ExecuteCliRequestOptions, "includeMethod" | "includeRequestTarget">,
): LogFields {
    return {
        ...(options.includeMethod === true ? { method } : {}),
        ...(options.includeRequestTarget === false
            ? {}
            : withRequestTarget(requestUrl.host, requestUrl.pathname)),
    };
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
