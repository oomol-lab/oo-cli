import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

import type { TextTableColumn } from "../shared/text-table.ts";

import type { ConnectorAppView } from "./shared.ts";
import { z } from "zod";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { formatTextTable } from "../shared/text-table.ts";
import {
    teamIdentityInputShape,
    teamIdentityOptions,
} from "../team/identity.ts";
import { connectorSearchServiceColor } from "./search-provider.ts";
import { resolveConnectorSession } from "./session.ts";
import {
    listConnectorApps,
    listConnectorAppsByService,
} from "./shared.ts";

// Connector app connection statuses (from the apps API) mapped to the terminal
// color that conveys their health at a glance. Unknown statuses fall back to a
// neutral gray.
const connectorAppStatusColors = {
    active: "green",
    disconnected: "gray",
    error: "red",
    reauth_required: "yellow",
} as const;

// Whether the command listed every connected app or scoped the listing to one
// service. Recorded as privacy-safe telemetry.
type ConnectorAppsListScope = "all" | "service";

interface ConnectorAppsInput {
    team?: string;
    personal?: boolean;
    serviceName?: string;
}

interface ConnectorAppListItem {
    accountLabel: string;
    authType: string | null;
    connectionName: string | null;
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
    arguments: [
        {
            name: "serviceName",
            descriptionKey: "arguments.connectorAppsServiceName",
            required: false,
        },
    ],
    options: [
        ...teamIdentityOptions({
            personal: "options.connectorAppsPersonal",
            team: "options.connectorAppsTeam",
        }),
    ],
    output: "standard",
    inputSchema: z.object({
        ...teamIdentityInputShape,
        serviceName: z.string().optional(),
    }),
    handler: async (input, context) => {
        const serviceName = input.serviceName?.trim();
        const hasService = serviceName !== undefined && serviceName !== "";
        const listScope: ConnectorAppsListScope = hasService ? "service" : "all";

        const { identity, target } = await resolveConnectorSession(
            {
                personal: input.personal,
                team: input.team,
            },
            context,
        );

        context.telemetry?.recordProperties({
            list_scope: listScope,
        });

        const apps = hasService
            ? await listConnectorAppsByService(
                    { identity, serviceName, target },
                    context,
                )
            : await listConnectorApps({ identity, target }, context);
        const output = apps.map(createConnectorAppListItem);

        context.telemetry?.recordProperties({
            result_count_bucket: bucketTelemetryCount(output.length),
        });

        context.output.emit(output, () => {
            context.stdout.write(
                `${formatConnectorAppsAsText(
                    output,
                    listScope,
                    context.translator,
                    createWriterColors(context.stdout),
                )}\n`,
            );
        });
    },
};

function createConnectorAppListItem(app: ConnectorAppView): ConnectorAppListItem {
    return {
        accountLabel: app.accountLabel,
        authType: app.authType,
        connectionName: app.connectionName,
        displayName: app.displayName,
        isDefault: app.isDefault,
        scopes: app.scopes,
        service: app.service,
        status: app.status,
    };
}

type ConnectorAppsTranslator = Pick<CliExecutionContext["translator"], "t">;

// Renders the app listing as a color-coded, column-aligned table. Colors are
// applied through the writer-aware palette, so a non-TTY / NO_COLOR stream (and
// tests) receive plain aligned text.
export function formatConnectorAppsAsText(
    apps: readonly ConnectorAppListItem[],
    listScope: ConnectorAppsListScope,
    translator: ConnectorAppsTranslator,
    colors: TerminalColors,
): string {
    if (apps.length === 0) {
        return translator.t(
            listScope === "service"
                ? "connector.apps.text.noResults"
                : "connector.apps.text.noConnections",
        );
    }

    return formatTextTable(
        createConnectorAppsColumns(listScope, translator, colors),
        apps,
        colors,
    );
}

function createConnectorAppsColumns(
    listScope: ConnectorAppsListScope,
    translator: ConnectorAppsTranslator,
    colors: TerminalColors,
): TextTableColumn<ConnectorAppListItem>[] {
    const serviceColor = colors.hex(connectorSearchServiceColor);
    // The list-all view spans services, so it leads with a Service column; the
    // by-service view keeps its original columns because the service is implied
    // by the argument.
    const serviceColumn: TextTableColumn<ConnectorAppListItem> = {
        header: translator.t("connector.apps.text.service"),
        render: app => serviceColor(app.service),
    };
    const columns: TextTableColumn<ConnectorAppListItem>[] = [
        {
            header: translator.t("connector.apps.text.connectionName"),
            render: app => app.connectionName ?? colors.dim("-"),
        },
        {
            header: translator.t("connector.apps.text.name"),
            render: app => colors.bold(app.displayName),
        },
        {
            header: translator.t("connector.apps.text.status"),
            render: app => colorConnectorAppStatus(app.status, colors),
        },
        {
            header: translator.t("connector.apps.text.auth"),
            render: app => colors.dim(app.authType ?? "-"),
        },
        {
            header: translator.t("connector.apps.text.default"),
            render: app => app.isDefault ? colors.green("✓") : colors.dim("-"),
        },
    ];

    return listScope === "all" ? [serviceColumn, ...columns] : columns;
}

function colorConnectorAppStatus(status: string, colors: TerminalColors): string {
    const colorName = status in connectorAppStatusColors
        ? connectorAppStatusColors[status as keyof typeof connectorAppStatusColors]
        : "gray";

    return colors[colorName](status);
}
