import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import { Buffer } from "node:buffer";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { bucketTelemetryBytes } from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { readJsonInputValue } from "../shared/json-input.ts";
import { ensureConnectorActionSchemaReference } from "./schema-cache.ts";
import {
    connectorFormatValues,
    runConnectorAction,
} from "./shared.ts";
import { validateConnectorActionInput } from "./validation.ts";

const connectorRunExecutionIdColor = "#59F78D";

const connectorRunDataErrorKeys = {
    dataFilePathRequired: "errors.connectorRun.dataFilePathRequired",
    dataReadFailed: "errors.connectorRun.dataReadFailed",
    invalidDataJson: "errors.connectorRun.invalidDataJson",
} as const;

type ConnectorRunTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

interface ConnectorRunInput {
    action?: string;
    data?: string;
    dryRun?: boolean;
    format?: (typeof connectorFormatValues)[number];
    serviceName: string;
}

export const connectorRunCommand: CliCommandDefinition<ConnectorRunInput> = {
    name: "run",
    summaryKey: "commands.connector.run.summary",
    descriptionKey: "commands.connector.run.description",
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
            name: "action",
            longFlag: "--action",
            shortFlag: "-a",
            valueName: "action",
            descriptionKey: "options.action",
        },
        {
            name: "data",
            longFlag: "--data",
            shortFlag: "-d",
            valueName: "data",
            descriptionKey: "options.data",
        },
        {
            name: "dryRun",
            longFlag: "--dry-run",
            descriptionKey: "options.dryRun",
        },
        ...jsonOutputOptions,
    ],
    inputSchema: z.object({
        action: z.string().optional(),
        data: z.string().optional(),
        dryRun: z.boolean().optional(),
        format: z.enum(connectorFormatValues).optional(),
        serviceName: z.string(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const actionName = input.action?.trim();

        if (actionName === undefined || actionName === "") {
            throw new CliUserError("errors.connectorRun.actionRequired", 2);
        }

        const account = await requireCurrentAccount(context);
        const inputData = await readJsonInputValue(
            input.data,
            context,
            connectorRunDataErrorKeys,
            {},
        );

        context.telemetry?.recordProperties({
            action: actionName,
            data_size_bucket: bucketTelemetryBytes(
                Buffer.byteLength(JSON.stringify(inputData)),
            ),
            dry_run: input.dryRun === true,
            service: input.serviceName,
        });

        const actionReference = await ensureConnectorActionSchemaReference(
            {
                actionName,
                apiKey: account.apiKey,
                endpoint: account.endpoint,
                serviceName: input.serviceName,
            },
            context,
        );

        validateConnectorActionInput(
            inputData,
            actionReference.inputSchema,
            context.translator,
        );

        if (input.dryRun === true) {
            if (input.format === "json") {
                writeJsonOutput(context.stdout, {
                    dryRun: true,
                    ok: true,
                    schemaPath: actionReference.schemaPath,
                });
                return;
            }

            context.stdout.write(
                `${context.translator.t("connector.run.text.dryRunPassed")}\n`,
            );
            return;
        }

        let response: Awaited<ReturnType<typeof runConnectorAction>>;

        try {
            response = await runConnectorAction(
                {
                    actionName,
                    apiKey: account.apiKey,
                    endpoint: account.endpoint,
                    inputData,
                    serviceName: input.serviceName,
                },
                context,
            );
        }
        catch (error) {
            recordConnectorRunFailureTelemetry(error, context.telemetry);
            throw error;
        }

        if (input.format === "json") {
            writeJsonOutput(context.stdout, response);
            return;
        }

        context.stdout.write(
            `${formatConnectorRunResponseAsText(response, context)}\n`,
        );
    },
};

function formatConnectorRunResponseAsText(
    response: Awaited<ReturnType<typeof runConnectorAction>>,
    context: ConnectorRunTextContext,
): string {
    const colors = createWriterColors(context.stdout);

    return [
        `${context.translator.t("connector.run.text.executionId")}: ${colors.hex(connectorRunExecutionIdColor)(response.meta.executionId)}`,
        colors.bold(`${context.translator.t("connector.run.text.resultData")}:`),
        formatConnectorRunResultData(response.data, colors),
    ].join("\n");
}

function formatConnectorRunResultData(
    value: unknown,
    colors: ReturnType<typeof createWriterColors>,
): string {
    return colors.cyan(JSON.stringify(value, null, 2) ?? "null");
}

function recordConnectorRunFailureTelemetry(
    error: unknown,
    telemetry: CliExecutionContext["telemetry"],
): void {
    if (!(error instanceof CliUserError)) {
        return;
    }

    const status = error.params?.status;
    if (typeof status === "number") {
        telemetry?.recordProperties({
            http_status: status,
        });
    }

    const errorCode = error.params?.errorCode;
    if (typeof errorCode === "string" && errorCode !== "") {
        telemetry?.recordProperties({
            error_code: errorCode,
        });
    }
}
