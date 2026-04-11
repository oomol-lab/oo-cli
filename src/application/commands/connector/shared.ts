import type { CliExecutionContext } from "../../contracts/cli.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { withRequestTarget } from "../../logging/log-fields.ts";
import { requestText } from "../shared/request.ts";

export const connectorActionDefinitionSchema = z.object({
    description: z.string().optional().default(""),
    inputSchema: z.unknown(),
    name: z.string().min(1),
    outputSchema: z.unknown(),
    service: z.string().min(1),
});

const connectorActionSearchResponseSchema = z.object({
    data: z.array(connectorActionDefinitionSchema).optional().default([]),
});

const authenticatedConnectorServicesResponseSchema = z.object({
    data: z.array(z.string()).optional().default([]),
});

const connectorActionMetadataResponseSchema = z.object({
    data: z.object({
        description: z.string().optional().default(""),
        id: z.string(),
        inputSchema: z.unknown(),
        name: z.string().min(1),
        outputSchema: z.unknown(),
        providerPermissions: z.array(z.string()),
        requiredScopes: z.array(z.string()),
        service: z.string().min(1),
    }).transform(action => ({
        description: action.description,
        inputSchema: action.inputSchema,
        name: action.name,
        outputSchema: action.outputSchema,
        service: action.service,
    })),
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

const connectorActionFailureResponseSchema = z.object({
    errorCode: z.string().optional(),
    message: z.string().optional(),
    meta: z.object({
        actionId: z.string().optional(),
        executionId: z.string().optional(),
    }).partial().optional(),
}).passthrough();

export const connectorFormatValues = ["json"] as const;

export type ConnectorActionDefinition = z.output<typeof connectorActionDefinitionSchema>;
export type ConnectorActionRunResponse = z.output<typeof connectorActionRunResponseSchema>;

export async function searchConnectorActions(
    options: {
        apiKey: string;
        endpoint: string;
        keywords: readonly string[];
        text: string;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<ConnectorActionDefinition[]> {
    const requestUrl = new URL(
        `https://search.${options.endpoint}/v1/connector-actions`,
    );

    requestUrl.searchParams.set("q", options.text);

    if (options.keywords.length > 0) {
        requestUrl.searchParams.set("keywords", options.keywords.join(","));
    }

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
                message: error instanceof Error ? error.message : String(error),
            },
        ),
        fields: {
            start: {
                keywordCount: options.keywords.length,
                textLength: options.text.length,
            },
        },
        init: {
            headers: {
                Authorization: options.apiKey,
            },
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

export async function listAuthenticatedConnectorServices(
    options: {
        apiKey: string;
        endpoint: string;
        services: readonly string[];
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<Set<string>> {
    if (options.services.length === 0) {
        return new Set<string>();
    }

    const requestUrl = new URL(
        `https://connector.${options.endpoint}/v1/apps/authenticated`,
    );

    for (const service of options.services) {
        requestUrl.searchParams.append("service", service);
    }

    const rawResponse = await requestText({
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.connectorAuthenticated.requestFailed",
            1,
            {
                status,
            },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.connectorAuthenticated.requestError",
            1,
            {
                message: error instanceof Error ? error.message : String(error),
            },
        ),
        fields: {
            start: {
                serviceCount: options.services.length,
            },
        },
        init: {
            headers: {
                Authorization: options.apiKey,
            },
        },
        requestLabel: "Authenticated connector services",
        requestUrl,
    });

    try {
        return new Set(
            authenticatedConnectorServicesResponseSchema.parse(
                JSON.parse(rawResponse) as unknown,
            ).data,
        );
    }
    catch {
        throw new CliUserError("errors.connectorAuthenticated.invalidResponse", 1);
    }
}

export async function getConnectorActionMetadata(
    options: {
        actionName: string;
        apiKey: string;
        endpoint: string;
        serviceName: string;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<ConnectorActionDefinition> {
    const requestUrl = createConnectorActionRequestUrl(
        options.endpoint,
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
                message: error instanceof Error ? error.message : String(error),
            },
        ),
        fields: {
            start: {
                actionName: options.actionName,
                serviceName: options.serviceName,
            },
        },
        init: {
            headers: {
                Authorization: options.apiKey,
            },
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
        apiKey: string;
        endpoint: string;
        inputData: unknown;
        serviceName: string;
    },
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<ConnectorActionRunResponse> {
    const requestUrl = createConnectorActionRequestUrl(
        options.endpoint,
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
                "Authorization": options.apiKey,
                "Content-Type": "application/json",
            },
            method: "POST",
        });
        const durationMs = Date.now() - requestStartedAt;

        rawResponse = await response.text();

        if (!response.ok) {
            const failureResponse = parseConnectorFailureResponse(rawResponse);

            context.logger.warn(
                {
                    ...withRequestTarget(requestUrl.host, requestUrl.pathname),
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

            if (failureResponse?.message) {
                throw new CliUserError(
                    "errors.connectorRun.requestFailedWithMessage",
                    1,
                    {
                        message: failureResponse.message,
                        status: response.status,
                    },
                );
            }

            throw new CliUserError("errors.connectorRun.requestFailed", 1, {
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
            message: error instanceof Error ? error.message : String(error),
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

function createConnectorActionRequestUrl(
    endpoint: string,
    serviceName: string,
    actionName: string,
): URL {
    const qualifiedActionName
        = `${encodeURIComponent(serviceName)}.${encodeURIComponent(actionName)}`;

    return new URL(
        `https://connector.${endpoint}/v1/actions/${qualifiedActionName}`,
    );
}

function parseConnectorFailureResponse(
    rawResponse: string,
): z.output<typeof connectorActionFailureResponseSchema> | undefined {
    try {
        return connectorActionFailureResponseSchema.parse(
            JSON.parse(rawResponse) as unknown,
        );
    }
    catch {
        return undefined;
    }
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
