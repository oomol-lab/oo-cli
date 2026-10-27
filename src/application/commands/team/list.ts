import type { AccountDefaultTeam } from "../../auth/default-team.ts";
import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import type { TerminalColors } from "../../terminal-colors.ts";
import type { TextTableColumn } from "../shared/text-table.ts";

import type { TeamIdentity } from "./identity.ts";

import type { TeamRole, TeamView } from "./shared.ts";
import { z } from "zod";
import { readDefaultTeam, writeDefaultTeam } from "../../auth/default-team.ts";
import { requireIdentity } from "../../auth/identity.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { formatTextTable } from "../shared/text-table.ts";
import { resolveTeamIdentity } from "./identity.ts";
import { listMemberTeams } from "./shared.ts";

interface TeamListItem {
    current: boolean;
    isDefault: boolean;
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
        const teams = await listMemberTeams(account, context);

        await backfillDefaultTeamId(context, defaultTeam, teams);

        const output = teams.map(team => ({
            current: isCurrentTeamRow(team, identity),
            isDefault: team.isDefault,
            id: team.id,
            name: team.name,
            role: team.role,
        }));

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

// Decides which row is current for connector commands. An
// offline identity carries exactly the dimension its source supplies — the id
// under OO_TEAM_ID, the name under OO_TEAM_NAME, and whichever the account
// default stored — so the row is matched on whichever one is known. With no
// local selection, the backend default marker determines the current row.
function isCurrentTeamRow(
    team: TeamView,
    identity: TeamIdentity | undefined,
): boolean {
    if (identity === undefined) {
        return team.isDefault;
    }

    return identity.id !== null
        ? team.id === identity.id
        : team.name === identity.name;
}

type TeamListTranslator = Pick<CliExecutionContext["translator"], "t">;

// Renders the team listing as a color-coded, column-aligned table. The
// backend default is shown separately from the effective current selection
// used by `oo connector run` without `--team`.
export function formatTeamsAsText(
    teams: readonly TeamListItem[],
    translator: TeamListTranslator,
    colors: TerminalColors,
): string {
    if (teams.length === 0) {
        return translator.t("team.list.text.noTeams");
    }

    return formatTextTable(
        createTeamListColumns(translator, colors),
        teams,
        colors,
    );
}

function createTeamListColumns(
    translator: TeamListTranslator,
    colors: TerminalColors,
): TextTableColumn<TeamListItem>[] {
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
            render: team => team.isDefault ? colors.green("✓") : colors.dim("-"),
        },
        {
            header: translator.t("team.list.text.current"),
            render: team => team.current
                ? colors.green("✓")
                : colors.dim("-"),
        },
    ];
}
