import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { ConnectorProxyResponse } from "./shared.ts";

import { Buffer } from "node:buffer";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { bucketTelemetryBytes } from "../../telemetry/buckets.ts";
import { readJsonInputValue } from "../shared/json-input.ts";
import {
    teamIdentityInputShape,
    teamOption,
} from "../team/identity.ts";
import { resolveConnectorSession } from "./session.ts";
import { runConnectorProxy } from "./shared.ts";
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

type ConnectorProxyRequest = z.output<typeof proxyRequestSchema>;

interface ConnectorProxyInput {
    body?: string;
    data?: string;
    endpoint?: string;
    headers?: string;
    method?: string;
    team?: string;
    query?: string;
    serviceName: string;
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
        teamOption("options.connectorProxyTeam"),
    ],
    output: "standard",
    inputSchema: z.object({
        body: z.string().optional(),
        data: z.string().optional(),
        endpoint: z.string().optional(),
        headers: z.string().optional(),
        method: z.string().optional(),
        ...teamIdentityInputShape,
        query: z.string().optional(),
        serviceName: z.string(),
    }),
    handler: async (input, context) => {
        // Payload parsing must stay ahead of the session: proxy usage errors
        // are reported before any login requirement.
        const proxyRequest = await buildConnectorProxyRequest(input, context);
        const { identity, target } = await resolveConnectorSession(
            {
                team: input.team,
            },
            context,
        );

        context.telemetry?.recordProperties({
            data_size_bucket: bucketTelemetryBytes(
                Buffer.byteLength(JSON.stringify(proxyRequest)),
            ),
            has_body: proxyRequest.body !== undefined,
            method: proxyRequest.method,
        });

        let response: ConnectorProxyResponse;
        try {
            response = await runConnectorProxy(
                {
                    identity,
                    proxyRequest,
                    serviceName: input.serviceName,
                    target,
                },
                context,
            );
        }
        catch (error) {
            recordConnectorFailureTelemetry(error, context.telemetry);
            throw error;
        }

        context.output.emit(response, () => {
            context.stdout.write(`${formatConnectorProxyResponseAsText(response, context)}\n`);
        });
    },
};

async function buildConnectorProxyRequest(
    input: ConnectorProxyInput,
    context: Pick<CliExecutionContext, "cwd">,
): Promise<ConnectorProxyRequest> {
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

function parseProxyRequest(value: unknown): ConnectorProxyRequest {
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
