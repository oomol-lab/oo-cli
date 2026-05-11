import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import {
    createConnectorActionSchemaOutput,
    loadConnectorActionSchema,
} from "./schema-cache.ts";
import { connectorSchemaRefreshCommand } from "./schema-refresh.ts";
import { requireConnectorActionName } from "./shared.ts";

interface ConnectorSchemaInput {
    action?: string;
    refresh?: boolean;
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
            name: "refresh",
            longFlag: "--refresh",
            descriptionKey: "options.refresh",
        },
    ],
    inputSchema: z.object({
        action: z.string().optional(),
        refresh: z.boolean().optional(),
        serviceName: z.string(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const actionName = requireConnectorActionName(input.action);

        context.telemetry?.recordProperties({
            refresh: input.refresh === true,
        });

        const account = await requireCurrentAccount(context);
        const actionSchema = await loadConnectorActionSchema(
            {
                account,
                actionName,
                refresh: input.refresh,
                serviceName: input.serviceName,
            },
            context,
        );
        if (actionSchema.asyncLifecycle === undefined) {
            const { asyncLifecycle: _asyncLifecycle, ...syncActionSchema } = actionSchema;

            writeJsonOutput(
                context.stdout,
                createConnectorActionSchemaOutput(syncActionSchema),
            );
            return;
        }

        const pollActionSchema = await loadConnectorActionSchema(
            {
                account,
                actionName: actionSchema.asyncLifecycle.poll.action,
                refresh: input.refresh,
                serviceName: input.serviceName,
            },
            context,
        );

        writeJsonOutput(
            context.stdout,
            createConnectorActionSchemaOutput(actionSchema, { pollActionSchema }),
        );
    },
};
