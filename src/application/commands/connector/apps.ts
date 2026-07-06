import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

import type { ConnectorAppView } from "./shared.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { getConfiguredIdentityOrganization } from "../../schemas/settings.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { resolveConnectorIdentity } from "./identity.ts";
import { connectorSearchServiceColor } from "./search-provider.ts";
import {
    connectorFormatValues,
    listConnectorApps,
    listConnectorAppsByService,
} from "./shared.ts";
import { resolveConnectorTarget } from "./target.ts";

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
    format?: (typeof connectorFormatValues)[number];
    organization?: string;
    personal?: boolean;
    serviceName?: string;
    showSchemaVersion?: boolean;
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
        {
            name: "organization",
            longFlag: "--organization",
            aliasFlags: ["--org"],
            valueName: "organization",
            descriptionKey: "options.connectorAppsOrganization",
        },
        {
            name: "personal",
            longFlag: "--personal",
            descriptionKey: "options.connectorAppsPersonal",
        },
        ...jsonOutputOptions,
    ],
    inputSchema: z.object({
        format: z.enum(connectorFormatValues).optional(),
        organization: z.string().optional(),
        personal: z.boolean().optional(),
        serviceName: z.string().optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        if (input.personal === true && input.organization !== undefined) {
            throw new CliUserError("errors.connectorRun.identityConflict", 2);
        }

        const organizationFlag = input.organization?.trim();
        if (input.organization !== undefined && organizationFlag === "") {
            throw new CliUserError("errors.connectorRun.organizationEmpty", 2);
        }

        const serviceName = input.serviceName?.trim();
        const hasService = serviceName !== undefined && serviceName !== "";
        const listScope: ConnectorAppsListScope = hasService ? "service" : "all";

        const target = await resolveConnectorTarget(context);

        // Mirrors `connector run`: the self-hosted runtime has no organization
        // concept, so an explicit --organization is rejected and any configured
        // default identity is ignored.
        if (target.kind === "self_hosted" && organizationFlag !== undefined) {
            throw new CliUserError("errors.connector.organizationUnsupported", 2);
        }

        const settings = await context.settingsStore.read();
        const { identity, source: identitySource } = target.kind === "self_hosted"
            ? { identity: {}, source: "personal" as const }
            : resolveConnectorIdentity({
                    configOrganization: getConfiguredIdentityOrganization(settings),
                    organizationFlag,
                    personalFlag: input.personal === true,
                });

        context.telemetry?.recordProperties({
            connector_kind: target.kind,
            identity_source: identitySource,
            list_scope: listScope,
        });

        const apps = serviceName !== undefined && serviceName !== ""
            ? await listConnectorAppsByService(
                    { identity, serviceName, target },
                    context,
                )
            : await listConnectorApps({ identity, target }, context);
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

        context.stdout.write(
            `${formatConnectorAppsAsText(
                output,
                listScope,
                context.translator,
                createWriterColors(context.stdout),
            )}\n`,
        );
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

interface ConnectorAppsColumn {
    header: string;
    render: (app: ConnectorAppListItem) => string;
}

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

    const columns = createConnectorAppsColumns(listScope, translator, colors);
    const headerCells = columns.map(column => colors.dim(column.header));
    const rows = apps.map(app => columns.map(column => column.render(app)));
    // Column widths use the terminal display width, which ignores ANSI color
    // escapes and counts wide CJK/emoji glyphs as two columns, so neither color
    // codes nor multi-cell characters skew the alignment.
    const widths = columns.map((_, index) => Math.max(
        visibleWidth(headerCells[index]!),
        ...rows.map(row => visibleWidth(row[index]!)),
    ));

    return [headerCells, ...rows]
        .map(cells => joinConnectorAppsRow(cells, widths))
        .join("\n");
}

function createConnectorAppsColumns(
    listScope: ConnectorAppsListScope,
    translator: ConnectorAppsTranslator,
    colors: TerminalColors,
): ConnectorAppsColumn[] {
    const serviceColor = colors.hex(connectorSearchServiceColor);
    // The list-all view spans services, so it leads with a Service column; the
    // by-service view keeps its original columns because the service is implied
    // by the argument.
    const serviceColumn: ConnectorAppsColumn = {
        header: translator.t("connector.apps.text.service"),
        render: app => serviceColor(app.service),
    };
    const columns: ConnectorAppsColumn[] = [
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

// Pads every cell except the last to its column width (measured in display
// columns) and joins the row with a two-space gutter.
function joinConnectorAppsRow(
    cells: readonly string[],
    widths: readonly number[],
): string {
    return cells
        .map((cell, index) => index === cells.length - 1
            ? cell
            : cell + " ".repeat(widths[index]! - visibleWidth(cell)))
        .join("  ");
}

// Terminal display width of the cell: ANSI color escapes count as zero and wide
// CJK/emoji glyphs count as two columns, unlike `String.length` (UTF-16 units).
function visibleWidth(cell: string): number {
    return Bun.stringWidth(cell);
}
