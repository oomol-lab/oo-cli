import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { clearDefaultTeam } from "../../auth/default-team.ts";
import {
    buildEnvApiKeyAccount,
    reportOverriddenWrite,
} from "../../auth/identity.ts";
import { writeLine } from "../shared/output.ts";
import { resolveTeamIdentity } from "./identity.ts";

// Clears the active account's default team identity, returning connector
// commands to the personal identity. Offline: it only rewrites local state.
// When OO_TEAM_ID / OO_TEAM_NAME is set, the env override keeps selecting a
// team regardless of the cleared default, so the output says so instead of
// promising a personal identity.
export const teamClearCommand: CliCommandDefinition = {
    name: "clear",
    summaryKey: "commands.team.clear.summary",
    descriptionKey: "commands.team.clear.description",
    inputSchema: z.object({}),
    handler: async (_input, context) => {
        // Nothing persisted is in effect under OO_API_KEY, so there is nothing
        // this command could clear that a later command would notice.
        if (buildEnvApiKeyAccount(context.env) !== undefined) {
            reportOverriddenWrite(context, {
                summaryKey: "team.clear.envOverrideNoop",
            });
            return;
        }

        // Offline resolution with no account default: what remains is exactly
        // the env override that would keep selecting a team after the clear,
        // with `envVar` naming it for the hint.
        const envIdentity = await resolveTeamIdentity(
            {
                account: undefined,
                defaultTeam: undefined,
                resolveAgainstBackend: false,
            },
            context,
        );
        const hadDefaultTeam = await clearDefaultTeam(context);

        if (!hadDefaultTeam) {
            writeLine(
                context.stdout,
                envIdentity?.envVar === undefined
                    ? context.translator.t("team.clear.alreadyPersonal")
                    : context.translator.t(
                            "team.clear.alreadyPersonalEnvHint",
                            {
                                envVar: envIdentity.envVar,
                            },
                        ),
            );
            return;
        }

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
            envIdentity?.envVar === undefined
                ? context.translator.t("team.clear.success")
                : context.translator.t("team.clear.successEnvOverride", {
                        envVar: envIdentity.envVar,
                    }),
        );
    },
};
