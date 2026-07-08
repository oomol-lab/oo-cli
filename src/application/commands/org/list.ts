import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

import type { OrganizationRole, OrganizationView } from "./shared.ts";

import { z } from "zod";
import { getConfiguredIdentityOrganization } from "../../schemas/settings.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { listMemberOrganizations, orgFormatValues } from "./shared.ts";

interface OrgListInput {
    format?: (typeof orgFormatValues)[number];
    showSchemaVersion?: boolean;
}

interface OrgListItem {
    current: boolean;
    id: string;
    name: string;
    role: OrganizationRole;
}

export const orgListCommand: CliCommandDefinition<OrgListInput> = {
    name: "list",
    summaryKey: "commands.org.list.summary",
    descriptionKey: "commands.org.list.description",
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        format: z.enum(orgFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const account = await requireCurrentAccount(context);
        const settings = await context.settingsStore.read();
        const configuredOrganization = getConfiguredIdentityOrganization(settings);

        const organizations = await listMemberOrganizations(account, context);
        const output = organizations.map(organization =>
            createOrgListItem(organization, configuredOrganization),
        );

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
            `${formatOrganizationsAsText(
                output,
                context.translator,
                createWriterColors(context.stdout),
            )}\n`,
        );
    },
};

function createOrgListItem(
    organization: OrganizationView,
    configuredOrganization: string | undefined,
): OrgListItem {
    return {
        current: organization.name === configuredOrganization,
        id: organization.id,
        name: organization.name,
        role: organization.role,
    };
}

type OrgListTranslator = Pick<CliExecutionContext["translator"], "t">;

interface OrgListColumn {
    header: string;
    render: (organization: OrgListItem) => string;
}

// Renders the organization listing as a color-coded, column-aligned table. The
// current default (matching `identity.organization`) is marked so callers can
// see at a glance which value `oo connector run` uses without `--org`.
export function formatOrganizationsAsText(
    organizations: readonly OrgListItem[],
    translator: OrgListTranslator,
    colors: TerminalColors,
): string {
    if (organizations.length === 0) {
        return translator.t("org.list.text.noOrganizations");
    }

    const columns = createOrgListColumns(translator, colors);
    const headerCells = columns.map(column => colors.dim(column.header));
    const rows = organizations.map(
        organization => columns.map(column => column.render(organization)),
    );
    // Column widths use the terminal display width, which ignores ANSI color
    // escapes and counts wide CJK/emoji glyphs as two columns, so neither color
    // codes nor multi-cell characters skew the alignment.
    const widths = columns.map((_, index) => Math.max(
        visibleWidth(headerCells[index]!),
        ...rows.map(row => visibleWidth(row[index]!)),
    ));

    return [headerCells, ...rows]
        .map(cells => joinOrgListRow(cells, widths))
        .join("\n");
}

function createOrgListColumns(
    translator: OrgListTranslator,
    colors: TerminalColors,
): OrgListColumn[] {
    return [
        {
            header: translator.t("org.list.text.organization"),
            render: organization => colors.bold(organization.name),
        },
        {
            header: translator.t("org.list.text.role"),
            render: organization => colors.dim(organization.role),
        },
        {
            header: translator.t("org.list.text.default"),
            render: organization => organization.current
                ? colors.green("✓")
                : colors.dim("-"),
        },
    ];
}

// Pads every cell except the last to its column width (measured in display
// columns) and joins the row with a two-space gutter.
function joinOrgListRow(
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
