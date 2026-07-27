import type { CliCommandDefinition } from "../../contracts/cli.ts";

import type { ConnectorActionMetadata } from "./shared.ts";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { writeJsonOutput } from "../command-output.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { loadConnectorActionSchema } from "./schema-cache.ts";
import { connectorSchemaRefreshCommand } from "./schema-refresh.ts";
import { requireConnectorActionName } from "./shared.ts";
import { resolveConnectorTarget } from "./target.ts";

interface ConnectorSchemaInput {
    action?: string;
    actionId?: string[];
    refresh?: boolean;
}

interface QualifiedActionTarget {
    actionName: string;
    serviceName: string;
}

export const connectorSchemaCommand: CliCommandDefinition<ConnectorSchemaInput> = {
    name: "schema",
    summaryKey: "commands.connector.schema.summary",
    descriptionKey: "commands.connector.schema.description",
    missingArgumentBehavior: "showHelp",
    children: [
        connectorSchemaRefreshCommand,
    ],
    arguments: [
        {
            name: "actionId",
            descriptionKey: "arguments.actionId",
            required: true,
            variadic: true,
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
            name: "refresh",
            longFlag: "--refresh",
            descriptionKey: "options.refresh",
        },
        {
            name: "json",
            longFlag: "--json",
            descriptionKey: "options.connectorSchemaJson",
        },
    ],
    inputSchema: z.object({
        action: z.string().optional(),
        actionId: z.array(z.string()).optional(),
        refresh: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const actionIds = input.actionId ?? [];
        const targets = input.action === undefined
            // New form: every positional is a `service.action` identifier.
            ? parseQualifiedActionIds(actionIds)
            // Legacy form: `--action` selects the action name and the single
            // positional is treated verbatim as the service name.
            : [createLegacyActionTarget(actionIds, input.action)];

        context.telemetry?.recordProperties({
            action_count_bucket: bucketTelemetryCount(targets.length),
            qualified: input.action === undefined,
            refresh: input.refresh === true,
        });

        const connectorTarget = await resolveConnectorTarget(context);

        context.telemetry?.recordProperties({
            connector_kind: connectorTarget.kind,
        });

        const outputs: ConnectorActionSchemaOutput[] = [];

        for (const target of targets) {
            const actionSchema = await loadConnectorActionSchema(
                {
                    actionName: target.actionName,
                    refresh: input.refresh,
                    serviceName: target.serviceName,
                    target: connectorTarget,
                },
                context,
            );

            outputs.push(createConnectorActionSchemaOutput(actionSchema));
        }

        // A single requested action keeps the historical object shape; two or
        // more actions widen the output to an array in request order.
        writeJsonOutput(
            context.stdout,
            outputs.length === 1 ? outputs[0]! : outputs,
        );
    },
};

function parseQualifiedActionIds(
    actionIds: readonly string[],
): QualifiedActionTarget[] {
    if (actionIds.length === 0) {
        throw new CliUserError("errors.connectorSchema.actionIdRequired", 2);
    }

    return actionIds.map(parseQualifiedActionId);
}

function parseQualifiedActionId(rawActionId: string): QualifiedActionTarget {
    const trimmed = rawActionId.trim();
    const separatorIndex = trimmed.indexOf(".");

    // Require a non-empty service segment before the first dot and a non-empty
    // action segment after it, e.g. `cal.create_schedule`.
    if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
        throw new CliUserError("errors.connectorSchema.invalidActionId", 2, {
            actionId: rawActionId,
        });
    }

    return {
        actionName: trimmed.slice(separatorIndex + 1),
        serviceName: trimmed.slice(0, separatorIndex),
    };
}

// The stable `oo connector schema` output contract: exactly the five schema
// fields, so cache-internal metadata (permissions, lifecycle, passthrough
// fields) never leaks into the CLI output.
interface ConnectorActionSchemaOutput {
    description: string;
    inputSchema: unknown;
    name: string;
    outputSchema: unknown;
    service: string;
}

function createConnectorActionSchemaOutput(
    schema: ConnectorActionMetadata,
): ConnectorActionSchemaOutput {
    return {
        description: schema.description,
        inputSchema: schema.inputSchema,
        name: schema.name,
        outputSchema: schema.outputSchema,
        service: schema.service,
    };
}

function createLegacyActionTarget(
    actionIds: readonly string[],
    rawAction: string,
): QualifiedActionTarget {
    if (actionIds.length !== 1) {
        throw new CliUserError(
            "errors.connectorSchema.legacyActionSingleService",
            2,
        );
    }

    const serviceName = actionIds[0]!.trim();

    // With `--action` present the positional is a bare service name, so an
    // empty value or a dotted `<service>.<action>` value means the two syntaxes
    // were mixed; reject it instead of issuing a doomed metadata request.
    if (serviceName === "" || serviceName.includes(".")) {
        throw new CliUserError(
            "errors.connectorSchema.legacyActionSingleService",
            2,
        );
    }

    return {
        actionName: requireConnectorActionName(rawAction),
        serviceName,
    };
}
