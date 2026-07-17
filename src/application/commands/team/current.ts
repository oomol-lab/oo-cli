import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { getConfiguredIdentityTeam } from "../../schemas/settings.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { writeLine } from "../shared/output.ts";
import {
    readTeamEnvOverride,
    teamEnvOverrideVariableName,
} from "../shared/team-env-override.ts";
import { teamFormatValues } from "./shared.ts";

interface TeamCurrentInput {
    format?: (typeof teamFormatValues)[number];
    showSchemaVersion?: boolean;
}

// `source` says which mechanism selects the team: the OO_TEAM_ID /
// OO_TEAM_NAME env override, the `identity.team` config default, or none
// (personal). `team` carries the name when it is known and `teamId` the id;
// an env id override knows only the id, and this offline command never
// resolves one form into the other.
interface TeamCurrentJsonPayload {
    team: string | null;
    teamId: string | null;
    source: "config" | "env_id" | "env_name" | null;
}

// Reports the team identity that connector commands use when no `--team` /
// `--personal` flag is given: the OO_TEAM_ID / OO_TEAM_NAME env override when
// set, otherwise the config `identity.team` default. Offline by design: it
// only reads local settings and the environment, so agents can cheaply learn
// "which identity do I run as by default" without a network round-trip.
export const teamCurrentCommand: CliCommandDefinition<TeamCurrentInput> = {
    name: "current",
    summaryKey: "commands.team.current.summary",
    descriptionKey: "commands.team.current.description",
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        format: z.enum(teamFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const settings = await context.settingsStore.read();
        const configuredTeam = getConfiguredIdentityTeam(settings);
        const envOverride = readTeamEnvOverride(context.env);

        const source = envOverride !== undefined
            ? (envOverride.kind === "id" ? "env_id" as const : "env_name" as const)
            : (configuredTeam !== undefined ? "config" as const : null);

        context.telemetry?.recordProperties({
            has_configured_team: configuredTeam !== undefined,
            team_source: source ?? "none",
        });

        if (input.format === "json") {
            const payload: TeamCurrentJsonPayload = {
                team: envOverride !== undefined
                    ? (envOverride.kind === "name" ? envOverride.value : null)
                    : configuredTeam ?? null,
                teamId: envOverride?.kind === "id" ? envOverride.value : null,
                source,
            };

            writeJsonOutput(context.stdout, payload, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        if (envOverride !== undefined) {
            writeLine(
                context.stdout,
                envOverride.kind === "id"
                    ? context.translator.t("team.current.text.envId", {
                            teamId: envOverride.value,
                        })
                    : context.translator.t("team.current.text.envName", {
                            team: envOverride.value,
                        }),
            );

            if (configuredTeam !== undefined) {
                writeLine(
                    context.stdout,
                    context.translator.t("team.current.text.configIgnored", {
                        envVar: teamEnvOverrideVariableName(envOverride),
                        team: configuredTeam,
                    }),
                );
            }
            return;
        }

        writeLine(
            context.stdout,
            configuredTeam === undefined
                ? context.translator.t("team.current.text.personal")
                : context.translator.t("team.current.text.configured", {
                        team: configuredTeam,
                    }),
        );
    },
};
