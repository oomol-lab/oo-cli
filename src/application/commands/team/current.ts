import type { CliCommandDefinition } from "../../contracts/cli.ts";

import type {
    TeamIdentitySource,
    TeamNameStatus,
} from "./identity.ts";
import { z } from "zod";
import { readDefaultTeam } from "../../auth/default-team.ts";
import { resolveIdentity } from "../../auth/identity.ts";
import { writeLine } from "../shared/output.ts";
import {
    appendTeamIdentityStatus,
    formatTeamIdentityValue,
    resolveTeamIdentity,
    teamNameStatusForTelemetry,
} from "./identity.ts";

// `source` says which mechanism selects the team: the OO_TEAM_ID /
// OO_TEAM_NAME env override, the account's saved default, or none
// (personal). `team` carries the name and `teamId` the id.
//
// `status` reports how the backend lookup ended and is `null` whenever none
// was attempted — env-selected identities are looked up in whichever
// direction they are missing, a saved default never is.
interface TeamCurrentJsonPayload {
    team: string | null;
    teamId: string | null;
    source: TeamIdentitySource | null;
    status: TeamNameStatus | null;
}

// Reports the team identity that connector commands use when no `--team` /
// `--personal` flag is given: the OO_TEAM_ID / OO_TEAM_NAME env override when
// set, otherwise the active account's saved default team.
//
// An env-selected identity starts out with only the dimension the variable
// supplies, which tells a reader nothing about the most common
// misconfiguration there is — a team the account cannot actually use. Those
// identities, and only those, spend one request to complete and validate the
// other dimension. The account default stays offline, as does an
// unauthenticated run: having no account skips the lookup rather than failing
// the command, so reading the local default never requires a login.
export const teamCurrentCommand: CliCommandDefinition = {
    name: "current",
    summaryKey: "commands.team.current.summary",
    descriptionKey: "commands.team.current.description",
    output: "standard",
    inputSchema: z.object({}),
    handler: async (_input, context) => {
        const [defaultTeam, { account }] = await Promise.all([
            readDefaultTeam(context),
            resolveIdentity(context),
        ]);
        const identity = await resolveTeamIdentity(
            { account, defaultTeam, resolveAgainstBackend: true },
            context,
        );

        context.telemetry?.recordProperties({
            has_configured_team: defaultTeam !== undefined,
            team_source: identity?.source ?? "none",
            team_status: teamNameStatusForTelemetry(identity),
        });

        const payload: TeamCurrentJsonPayload = {
            team: identity?.name ?? null,
            teamId: identity?.id ?? null,
            source: identity?.source ?? null,
            status: identity?.status ?? null,
        };

        context.output.emit(payload, () => {
            if (identity === undefined) {
                writeLine(
                    context.stdout,
                    context.translator.t("team.current.text.personal"),
                );
                return;
            }

            const teamValue = formatTeamIdentityValue(identity, context.translator);

            if (identity.source === "account") {
                writeLine(
                    context.stdout,
                    context.translator.t("team.current.text.accountDefault", {
                        team: teamValue,
                    }),
                );
                return;
            }

            // The reason is appended to the finished sentence so it lands last,
            // where the reader looks for it, instead of mid-line.
            writeLine(
                context.stdout,
                appendTeamIdentityStatus(
                    context.translator.t(
                        identity.source === "env_id"
                            ? "team.current.text.envId"
                            : "team.current.text.envName",
                        { team: teamValue },
                    ),
                    identity,
                    context.translator,
                ),
            );

            // The saved default is still on disk and takes over the moment the
            // variable is unset, so saying so here heads off a later "my default
            // did not apply" report.
            if (defaultTeam !== undefined && identity.envVar !== undefined) {
                writeLine(
                    context.stdout,
                    context.translator.t("team.current.text.accountDefaultIgnored", {
                        envVar: identity.envVar,
                        team: defaultTeam.name,
                    }),
                );
            }
        });
    },
};
