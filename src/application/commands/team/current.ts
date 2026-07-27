import type { CliCommandDefinition } from "../../contracts/cli.ts";

import type {
    TeamIdentitySource,
    TeamNameStatus,
} from "./identity.ts";
import { z } from "zod";
import { resolveIdentity } from "../../auth/identity.ts";
import { getConfiguredIdentityTeam } from "../../schemas/settings.ts";
import { outputFormatOptions, writeJsonOutput } from "../command-output.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { writeLine } from "../shared/output.ts";
import {
    appendTeamIdentityStatus,
    formatTeamIdentityValue,
    resolveTeamIdentity,
    teamNameStatusForTelemetry,
} from "./identity.ts";
import { teamFormatValues } from "./shared.ts";

interface TeamCurrentInput {
    format?: (typeof teamFormatValues)[number];
    showSchemaVersion?: boolean;
}

// `source` says which mechanism selects the team: the OO_TEAM_ID /
// OO_TEAM_NAME env override, the `identity.team` config default, or none
// (personal). `team` carries the name and `teamId` the id.
//
// `status` reports how the backend lookup ended and is `null` whenever none
// was attempted — env-selected identities are looked up in whichever
// direction they are missing, a config name never is.
interface TeamCurrentJsonPayload {
    team: string | null;
    teamId: string | null;
    source: TeamIdentitySource | null;
    status: TeamNameStatus | null;
}

// Reports the team identity that connector commands use when no `--team` /
// `--personal` flag is given: the OO_TEAM_ID / OO_TEAM_NAME env override when
// set, otherwise the `identity.team` config default.
//
// An env-selected identity starts out with only the dimension the variable
// supplies, which tells a reader nothing about the most common
// misconfiguration there is — a team the account cannot actually use. Those
// identities, and only those, spend one request to complete and validate the
// other dimension. The config default stays offline, as does an
// unauthenticated run: having no account skips the lookup rather than failing
// the command, so reading the local default never requires a login.
export const teamCurrentCommand: CliCommandDefinition<TeamCurrentInput> = {
    name: "current",
    summaryKey: "commands.team.current.summary",
    descriptionKey: "commands.team.current.description",
    options: [...outputFormatOptions],
    inputSchema: z.object({
        format: z.enum(teamFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const [settings, { account }] = await Promise.all([
            context.settingsStore.read(),
            resolveIdentity(context),
        ]);
        const configuredTeam = getConfiguredIdentityTeam(settings);
        const identity = await resolveTeamIdentity(
            { account, configuredTeam, resolveAgainstBackend: true },
            context,
        );

        context.telemetry?.recordProperties({
            has_configured_team: configuredTeam !== undefined,
            team_source: identity?.source ?? "none",
            team_status: teamNameStatusForTelemetry(identity),
        });

        if (input.format === "json") {
            const payload: TeamCurrentJsonPayload = {
                team: identity?.name ?? null,
                teamId: identity?.id ?? null,
                source: identity?.source ?? null,
                status: identity?.status ?? null,
            };

            writeJsonOutput(context.stdout, payload, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        if (identity === undefined) {
            writeLine(
                context.stdout,
                context.translator.t("team.current.text.personal"),
            );
            return;
        }

        const teamValue = formatTeamIdentityValue(identity, context.translator);

        if (identity.source === "config") {
            writeLine(
                context.stdout,
                context.translator.t("team.current.text.configured", {
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

        // The config default is still on disk and takes over the moment the
        // variable is unset, so saying so here heads off a later "my default
        // did not apply" report.
        if (configuredTeam !== undefined && identity.envVar !== undefined) {
            writeLine(
                context.stdout,
                context.translator.t("team.current.text.configIgnored", {
                    envVar: identity.envVar,
                    team: configuredTeam,
                }),
            );
        }
    },
};
