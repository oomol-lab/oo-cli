import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import {
    getConfiguredIdentityTeam,
    unsetIdentityTeam,
} from "../../schemas/settings.ts";
import { writeLine } from "../shared/output.ts";
import {
    readTeamEnvOverride,
    teamEnvOverrideVariableName,
} from "../shared/team-env-override.ts";

// Clears the default team identity (config `identity.team`), returning
// connector commands to the personal identity. Offline: it only rewrites local
// settings. When OO_TEAM_ID / OO_TEAM_NAME is set, the env override keeps
// selecting a team regardless of the cleared default, so the output says so
// instead of promising a personal identity.
export const teamClearCommand: CliCommandDefinition = {
    name: "clear",
    summaryKey: "commands.team.clear.summary",
    descriptionKey: "commands.team.clear.description",
    inputSchema: z.object({}),
    handler: async (_input, context) => {
        const settings = await context.settingsStore.read();
        const hadConfiguredTeam
            = getConfiguredIdentityTeam(settings) !== undefined;
        const envOverride = readTeamEnvOverride(context.env);

        if (!hadConfiguredTeam) {
            writeLine(
                context.stdout,
                envOverride === undefined
                    ? context.translator.t("team.clear.alreadyPersonal")
                    : context.translator.t(
                            "team.clear.alreadyPersonalEnvHint",
                            {
                                envVar: teamEnvOverrideVariableName(envOverride),
                            },
                        ),
            );
            return;
        }

        await context.settingsStore.update(unsetIdentityTeam);

        context.logger.info(
            { teamConfigured: false },
            "Default team identity cleared.",
        );
        // One line per outcome: the plain success message promises a personal
        // identity, which is untrue while the env override still selects a
        // team, so the override case gets its own message instead of a
        // follow-up hint that contradicts the line above it.
        writeLine(
            context.stdout,
            envOverride === undefined
                ? context.translator.t("team.clear.success")
                : context.translator.t("team.clear.successEnvOverride", {
                        envVar: teamEnvOverrideVariableName(envOverride),
                    }),
        );
    },
};
