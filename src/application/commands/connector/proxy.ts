import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { ConnectorProxyResponse } from "./shared.ts";

import { Buffer } from "node:buffer";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { getConfiguredIdentityOrganization } from "../../schemas/settings.ts";
import { bucketTelemetryBytes } from "../../telemetry/buckets.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { readJsonInputValue } from "../shared/json-input.ts";
import { resolveConnectorIdentity } from "./identity.ts";
import {
    connectorFormatValues,
    runConnectorProxy,
} from "./shared.ts";
import { recordConnectorFailureTelemetry } from "./telemetry.ts";

const connectorProxyDataErrorKeys = {
    dataFilePathRequired: "errors.connectorProxy.dataFilePathRequired",
    dataReadFailed: "errors.connectorProxy.dataReadFailed",
    invalidDataJson: "errors.connectorProxy.invalidDataJson",
} as const;

const connectorProxyMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

const connectorProxyMethodSchema = z.string()
    .trim()
    .transform(value => value.toUpperCase())
    .pipe(z.enum(connectorProxyMethods));

const proxyQueryValueSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
]);

const proxyRequestSchema = z.object({
    body: z.unknown().optional(),
    endpoint: z.string().trim().min(1),
    headers: z.record(z.string(), z.string()).optional(),
    method: connectorProxyMethodSchema,
    query: z.record(z.string(), proxyQueryValueSchema).optional(),
}).strict();

interface ConnectorProxyInput {
    alias?: string;
    appId?: string;
    body?: string;
    data?: string;
    endpoint?: string;
    format?: (typeof connectorFormatValues)[number];
    headers?: string;
    method?: string;
    organization?: string;
    personal?: boolean;
    query?: string;
    serviceName: string;
    showSchemaVersion?: boolean;
}

export const connectorProxyCommand: CliCommandDefinition<ConnectorProxyInput> = {
    name: "proxy",
    summaryKey: "commands.connector.proxy.summary",
    descriptionKey: "commands.connector.proxy.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "serviceName",
            descriptionKey: "arguments.serviceName",
            required: true,
        },
    ],
    options: [
        {
            name: "data",
            longFlag: "--data",
            shortFlag: "-d",
            aliasFlags: ["--input"],
            valueName: "data",
            descriptionKey: "options.connectorProxyData",
        },
        {
            name: "endpoint",
            longFlag: "--endpoint",
            valueName: "endpoint",
            descriptionKey: "options.connectorProxyEndpoint",
        },
        {
            name: "method",
            longFlag: "--method",
            valueName: "method",
            descriptionKey: "options.connectorProxyMethod",
        },
        {
            name: "query",
            longFlag: "--query",
            valueName: "query",
            descriptionKey: "options.connectorProxyQuery",
        },
        {
            name: "headers",
            longFlag: "--headers",
            valueName: "headers",
            descriptionKey: "options.connectorProxyHeaders",
        },
        {
            name: "body",
            longFlag: "--body",
            valueName: "body",
            descriptionKey: "options.connectorProxyBody",
        },
        {
            name: "appId",
            longFlag: "--app-id",
            valueName: "appId",
            descriptionKey: "options.connectorProxyAppId",
        },
        {
            name: "alias",
            longFlag: "--alias",
            valueName: "alias",
            descriptionKey: "options.connectorProxyAlias",
        },
        {
            name: "organization",
            longFlag: "--organization",
            aliasFlags: ["--org"],
            valueName: "organization",
            descriptionKey: "options.connectorProxyOrganization",
        },
        {
            name: "personal",
            longFlag: "--personal",
            descriptionKey: "options.connectorProxyPersonal",
        },
        ...jsonOutputOptions,
    ],
    inputSchema: z.object({
        alias: z.string().optional(),
        appId: z.string().optional(),
        body: z.string().optional(),
        data: z.string().optional(),
        endpoint: z.string().optional(),
        format: z.enum(connectorFormatValues).optional(),
        headers: z.string().optional(),
        method: z.string().optional(),
        organization: z.string().optional(),
        personal: z.boolean().optional(),
        query: z.string().optional(),
        serviceName: z.string(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        if (input.personal === true && input.organization !== undefined) {
            throw new CliUserError("errors.connectorRun.identityConflict", 2);
        }

        if (input.appId !== undefined && input.alias !== undefined) {
            throw new CliUserError("errors.connectorProxy.selectorConflict", 2);
        }

        const organizationFlag = input.organization?.trim();
        if (input.organization !== undefined && organizationFlag === "") {
            throw new CliUserError("errors.connectorRun.organizationEmpty", 2);
        }

        const appId = trimOptionalSelector(input.appId, "errors.connectorProxy.appIdEmpty");
        const alias = trimOptionalSelector(input.alias, "errors.connectorProxy.aliasEmpty");
        const proxyRequest = await buildConnectorProxyRequest(input, context);
        const account = await requireCurrentAccount(context);
        const settings = await context.settingsStore.read();
        const { identity, source: identitySource } = resolveConnectorIdentity({
            configOrganization: getConfiguredIdentityOrganization(settings),
            organizationFlag,
            personalFlag: input.personal === true,
        });

        context.telemetry?.recordProperties({
            data_size_bucket: bucketTelemetryBytes(
                Buffer.byteLength(JSON.stringify(proxyRequest)),
            ),
            has_alias: alias !== undefined,
            has_app_id: appId !== undefined,
            has_body: hasProxyBody(proxyRequest),
            identity_source: identitySource,
            method: readProxyMethod(proxyRequest),
        });

        let response: ConnectorProxyResponse;
        try {
            response = await runConnectorProxy(
                {
                    alias,
                    apiKey: account.apiKey,
                    appId,
                    endpoint: account.endpoint,
                    identity,
                    proxyRequest,
                    serviceName: input.serviceName,
                },
                context,
            );
        }
        catch (error) {
            recordConnectorFailureTelemetry(error, context.telemetry);
            throw error;
        }

        if (input.format === "json") {
            writeJsonOutput(context.stdout, response, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        context.stdout.write(`${formatConnectorProxyResponseAsText(response, context)}\n`);
    },
};

async function buildConnectorProxyRequest(
    input: ConnectorProxyInput,
    context: Pick<CliExecutionContext, "cwd">,
): Promise<unknown> {
    if (input.data !== undefined && hasSplitProxyRequestInput(input)) {
        throw new CliUserError("errors.connectorProxy.dataConflict", 2);
    }

    if (input.data !== undefined) {
        return parseProxyRequest(
            await readJsonInputValue(input.data, context, connectorProxyDataErrorKeys, {}),
        );
    }

    if (input.endpoint === undefined || input.endpoint.trim() === "") {
        throw new CliUserError("errors.connectorProxy.endpointRequired", 2);
    }

    if (input.method === undefined) {
        throw new CliUserError("errors.connectorProxy.methodRequired", 2);
    }

    return parseProxyRequest({
        endpoint: input.endpoint,
        method: input.method,
        ...(input.query !== undefined
            ? { query: parseJsonOption(input.query, "errors.connectorProxy.invalidQueryJson") }
            : {}),
        ...(input.headers !== undefined
            ? {
                    headers: parseJsonOption(
                        input.headers,
                        "errors.connectorProxy.invalidHeadersJson",
                    ),
                }
            : {}),
        ...(input.body !== undefined
            ? { body: parseJsonOption(input.body, "errors.connectorProxy.invalidBodyJson") }
            : {}),
    });
}

function hasSplitProxyRequestInput(input: ConnectorProxyInput): boolean {
    return input.endpoint !== undefined
        || input.method !== undefined
        || input.query !== undefined
        || input.headers !== undefined
        || input.body !== undefined;
}

function parseProxyRequest(value: unknown): unknown {
    const parsed = proxyRequestSchema.safeParse(value);

    if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new CliUserError("errors.connectorProxy.invalidPayload", 2, {
            message: issue !== undefined
                ? formatProxyRequestIssue(issue)
                : "Invalid proxy request.",
        });
    }

    return parsed.data;
}

function formatProxyRequestIssue(issue: z.core.$ZodIssue): string {
    if (issue.path.length === 0) {
        return issue.message;
    }

    return `${issue.path.map(String).join(".")}: ${issue.message}`;
}

function parseJsonOption(value: string, errorKey: string): unknown {
    try {
        return JSON.parse(value) as unknown;
    }
    catch (error) {
        throw new CliUserError(errorKey, 2, {
            message: error instanceof Error ? error.message : String(error),
        });
    }
}

function trimOptionalSelector(value: string | undefined, errorKey: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    const trimmed = value.trim();

    if (trimmed === "") {
        throw new CliUserError(errorKey, 2);
    }

    return trimmed;
}

function hasProxyBody(proxyRequest: unknown): boolean {
    return typeof proxyRequest === "object"
        && proxyRequest !== null
        && "body" in proxyRequest;
}

function readProxyMethod(proxyRequest: unknown): string {
    if (
        typeof proxyRequest === "object"
        && proxyRequest !== null
        && "method" in proxyRequest
        && typeof proxyRequest.method === "string"
    ) {
        return proxyRequest.method;
    }

    return "unknown";
}

function formatConnectorProxyResponseAsText(
    response: ConnectorProxyResponse,
    context: Pick<CliExecutionContext, "translator">,
): string {
    return [
        `${context.translator.t("connector.proxy.text.status")}: ${response.data.status}`,
        `${context.translator.t("connector.run.text.executionId")}: ${response.meta.executionId}`,
        `${context.translator.t("connector.run.text.resultData")}:`,
        JSON.stringify(response.data.data, null, 2) ?? "null",
    ].join("\n");
}
