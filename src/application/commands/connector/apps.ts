import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { ConnectorAppView } from "./shared.ts";

import { z } from "zod";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import {
    connectorFormatValues,
    listConnectorAppsByService,
} from "./shared.ts";

interface ConnectorAppsInput {
    format?: (typeof connectorFormatValues)[number];
    serviceName: string;
    showSchemaVersion?: boolean;
}

interface ConnectorAppListItem {
    accountLabel: string;
    alias: string | null;
    authType: string | null;
    displayName: string;
    isDefault: boolean;
    scopes: string[];
    service: string;
    status: string;
}

export const connectorAppsCommand: CliCommandDefinition<ConnectorAppsInput> = {
    name: "apps",
    summaryKey: "commands.connector.apps.summary",
    descriptionKey: "commands.connector.apps.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "serviceName",
            descriptionKey: "arguments.serviceName",
            required: true,
        },
    ],
    options: [
        ...jsonOutputOptions,
    ],
    inputSchema: z.object({
        format: z.enum(connectorFormatValues).optional(),
        serviceName: z.string(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const account = await requireCurrentAccount(context);
        const apps = await listConnectorAppsByService(
            {
                apiKey: account.apiKey,
                endpoint: account.endpoint,
                serviceName: input.serviceName,
            },
            context,
        );
        const output = apps.map(createConnectorAppListItem);

        context.telemetry?.recordProperties({
            result_count_bucket: bucketTelemetryCount(output.length),
        });

        if (input.format === "json") {
            writeJsonOutput(context.stdout, output, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        context.stdout.write(`${formatConnectorAppsAsText(output, context)}\n`);
    },
};

function createConnectorAppListItem(app: ConnectorAppView): ConnectorAppListItem {
    return {
        accountLabel: app.accountLabel,
        alias: app.alias,
        authType: app.authType,
        displayName: app.displayName,
        isDefault: app.isDefault,
        scopes: app.scopes,
        service: app.service,
        status: app.status,
    };
}

type ConnectorAppsTextContext = Pick<CliExecutionContext, "translator">;

function formatConnectorAppsAsText(
    apps: readonly ConnectorAppListItem[],
    context: ConnectorAppsTextContext,
): string {
    if (apps.length === 0) {
        return context.translator.t("connector.apps.text.noResults");
    }

    return [
        [
            context.translator.t("connector.apps.text.alias"),
            context.translator.t("connector.apps.text.name"),
            context.translator.t("connector.apps.text.status"),
            context.translator.t("connector.apps.text.auth"),
            context.translator.t("connector.apps.text.default"),
        ].join("\t"),
        ...apps.map(app => [
            app.alias ?? "-",
            app.displayName,
            app.status,
            app.authType ?? "-",
            app.isDefault
                ? context.translator.t("connector.apps.text.default.yes")
                : context.translator.t("connector.apps.text.default.no"),
        ].join("\t")),
    ].join("\n");
}
