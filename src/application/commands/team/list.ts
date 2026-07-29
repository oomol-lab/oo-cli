import type { AccountDefaultTeam } from "../../auth/default-team.ts";
import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import type { TerminalColors } from "../../terminal-colors.ts";
import type { TeamIdentity } from "./identity.ts";

import type { TeamRole, TeamView } from "./shared.ts";
import { z } from "zod";
import { readDefaultTeam, writeDefaultTeam } from "../../auth/default-team.ts";
import { requireIdentity } from "../../auth/identity.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { resolveTeamIdentity } from "./identity.ts";
import { listMemberTeams } from "./shared.ts";

interface TeamListItem {
    current: boolean;
    id: string;
    name: string;
    role: TeamRole;
}

export const teamListCommand: CliCommandDefinition = {
    name: "list",
    summaryKey: "commands.team.list.summary",
    descriptionKey: "commands.team.list.description",
    output: "standard",
    inputSchema: z.object({}),
    handler: async (_input, context) => {
        const { account } = await requireIdentity(context);
        const defaultTeam = await readDefaultTeam(context);
        // The listing itself is the membership set, so the identity resolves
        // offline and each row is matched against the record locally.
        const identity = await resolveTeamIdentity(
            { account, defaultTeam, resolveAgainstBackend: false },
            context,
        );
        const isCurrent = (team: TeamView): boolean =>
            isCurrentTeamRow(team, identity);

        const teams = await listMemberTeams(account, context);

        await backfillDefaultTeamId(context, defaultTeam, teams);

        const output = teams.map(team => createTeamListItem(team, isCurrent));

        context.telemetry?.recordProperties({
            result_count_bucket: bucketTelemetryCount(output.length),
        });

        context.output.emit(output, () => {
            context.stdout.write(
                `${formatTeamsAsText(
                    output,
                    context.translator,
                    createWriterColors(context.stdout),
                )}\n`,
            );
        });
    },
};

// Completes a default team that only has a name. This command already holds
// the membership listing, so the id costs nothing here — which is the whole
// reason the backfill lives in this command rather than in a lookup of its
// own. A default migrated from the legacy global setting is the case that
// needs it.
//
// Best effort: listing teams is a read, and it must not start failing because
// the file happens to be unwritable.
async function backfillDefaultTeamId(
    context: Pick<
        CliExecutionContext,
        "authStore" | "logger" | "settingsStore" | "telemetry"
    >,
    defaultTeam: AccountDefaultTeam | undefined,
    teams: readonly TeamView[],
): Promise<void> {
    if (defaultTeam === undefined || defaultTeam.id !== null) {
        return;
    }

    const match = teams.find(team => team.name === defaultTeam.name);

    if (match === undefined) {
        return;
    }

    try {
        await writeDefaultTeam(context, { id: match.id, name: match.name });
    }
    catch (error) {
        context.logger.debug(
            { err: error },
            "Default team id backfill did not complete.",
        );
    }
}

// Decides which row is the effective default for connector commands. An
// offline identity carries exactly the dimension its source supplies — the id
// under OO_TEAM_ID, the name under OO_TEAM_NAME, and whichever the account
// default stored — so the row is matched on whichever one is known.
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
// effective default (the OO_TEAM_ID / OO_TEAM_NAME env override, or the
// account's saved default) is marked so callers can see at a glance which
// team `oo connector run` uses without `--team`.
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
