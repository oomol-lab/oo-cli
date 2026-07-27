import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

import type { TeamIdentity } from "./identity.ts";
import type { TeamRole, TeamView } from "./shared.ts";

import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { getConfiguredIdentityTeam } from "../../schemas/settings.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { outputFormatOptions, writeJsonOutput } from "../command-output.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { resolveTeamIdentity } from "./identity.ts";
import { listMemberTeams, teamFormatValues } from "./shared.ts";

interface TeamListInput {
    format?: (typeof teamFormatValues)[number];
    showSchemaVersion?: boolean;
}

interface TeamListItem {
    current: boolean;
    id: string;
    name: string;
    role: TeamRole;
}

export const teamListCommand: CliCommandDefinition<TeamListInput> = {
    name: "list",
    summaryKey: "commands.team.list.summary",
    descriptionKey: "commands.team.list.description",
    options: [...outputFormatOptions],
    inputSchema: z.object({
        format: z.enum(teamFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        const settings = await context.settingsStore.read();
        // The listing itself is the membership set, so the identity resolves
        // offline and each row is matched against the record locally.
        const identity = await resolveTeamIdentity(
            {
                account,
                configuredTeam: getConfiguredIdentityTeam(settings),
                resolveAgainstBackend: false,
            },
            context,
        );
        const isCurrent = (team: TeamView): boolean =>
            isCurrentTeamRow(team, identity);

        const teams = await listMemberTeams(account, context);
        const output = teams.map(team => createTeamListItem(team, isCurrent));

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
            `${formatTeamsAsText(
                output,
                context.translator,
                createWriterColors(context.stdout),
            )}\n`,
        );
    },
};

// Decides which row is the effective default for connector commands. An
// offline identity carries exactly the dimension its source supplies — the id
// under OO_TEAM_ID, the name under OO_TEAM_NAME or the config default — so
// the row is matched on whichever one is known.
function isCurrentTeamRow(
    team: TeamView,
    identity: TeamIdentity | undefined,
): boolean {
    if (identity === undefined) {
        return false;
    }

    return identity.id !== null
        ? team.id === identity.id
        : team.name === identity.name;
}

function createTeamListItem(
    team: TeamView,
    isCurrent: (team: TeamView) => boolean,
): TeamListItem {
    return {
        current: isCurrent(team),
        id: team.id,
        name: team.name,
        role: team.role,
    };
}

type TeamListTranslator = Pick<CliExecutionContext["translator"], "t">;

interface TeamListColumn {
    header: string;
    render: (team: TeamListItem) => string;
}

// Renders the team listing as a color-coded, column-aligned table. The
// effective default (the OO_TEAM_ID / OO_TEAM_NAME env override, or
// `identity.team`) is marked so callers can see at a glance which team
// `oo connector run` uses without `--team`.
export function formatTeamsAsText(
    teams: readonly TeamListItem[],
    translator: TeamListTranslator,
    colors: TerminalColors,
): string {
    if (teams.length === 0) {
        return translator.t("team.list.text.noTeams");
    }

    const columns = createTeamListColumns(translator, colors);
    const headerCells = columns.map(column => colors.dim(column.header));
    const rows = teams.map(
        team => columns.map(column => column.render(team)),
    );
    // Column widths use the terminal display width, which ignores ANSI color
    // escapes and counts wide CJK/emoji glyphs as two columns, so neither color
    // codes nor multi-cell characters skew the alignment.
    const widths = columns.map((_, index) => Math.max(
        visibleWidth(headerCells[index]!),
        ...rows.map(row => visibleWidth(row[index]!)),
    ));

    return [headerCells, ...rows]
        .map(cells => joinTeamListRow(cells, widths))
        .join("\n");
}

function createTeamListColumns(
    translator: TeamListTranslator,
    colors: TerminalColors,
): TeamListColumn[] {
    return [
        {
            header: translator.t("team.list.text.team"),
            render: team => colors.bold(team.name),
        },
        {
            header: translator.t("team.list.text.role"),
            render: team => colors.dim(team.role),
        },
        {
            header: translator.t("team.list.text.default"),
            render: team => team.current
                ? colors.green("✓")
                : colors.dim("-"),
        },
    ];
}

// Pads every cell except the last to its column width (measured in display
// columns) and joins the row with a two-space gutter.
function joinTeamListRow(
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
