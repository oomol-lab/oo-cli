import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { writeDefaultTeam } from "../../auth/default-team.ts";
import {
    buildEnvApiKeyAccount,
    reportOverriddenWrite,
    requireIdentity,
} from "../../auth/identity.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { writeLine } from "../shared/output.ts";
import { resolveTeamIdentity } from "./identity.ts";
import { listMemberTeams } from "./shared.ts";

interface TeamUseInput {
    name: string;
}

// Sets the default team identity on the active account after confirming the
// account is actually a member of it. The membership check is the value this
// command adds over editing auth.toml by hand: it rejects typos and stale
// names up front instead of surfacing them later on a connector run, and it
// is what supplies the team id stored alongside the name.
export const teamUseCommand: CliCommandDefinition<TeamUseInput> = {
    name: "use",
    summaryKey: "commands.team.use.summary",
    descriptionKey: "commands.team.use.description",
    arguments: [
        {
            name: "name",
            descriptionKey: "arguments.teamUseName",
            required: true,
        },
    ],
    inputSchema: z.object({
        name: z.string(),
    }),
    handler: async (input, context) => {
        const name = input.name.trim();

        if (name === "") {
            throw new CliUserError("errors.team.nameEmpty", 2);
        }

        // The default team belongs to a saved account, and OO_API_KEY has
        // none: its credential may not even be the same account. Writing here
        // would record a default no command under this variable ever reads.
        if (buildEnvApiKeyAccount(context.env) !== undefined) {
            reportOverriddenWrite(context, {
                summaryKey: "team.use.envOverrideNoop",
            });
            return;
        }

        const { account } = await requireIdentity(context);
        const teams = await listMemberTeams(account, context);
        const team = teams.find(candidate => candidate.name === name);

        if (team === undefined) {
            throw new CliUserError("errors.team.notAccessible", 1, {
                team: name,
            });
        }

        await writeDefaultTeam(context, { id: team.id, name: team.name });

        context.logger.info(
            { teamConfigured: true },
            "Default team identity persisted.",
        );
        writeLine(
            context.stdout,
            context.translator.t("team.use.success", { team: name }),
        );

        // Mirrors `oo auth login` under OO_TEAM_ID / OO_TEAM_NAME: the default
        // is saved, but the env override keeps outranking it, so say so
        // instead of letting the success line imply the new default is in
        // effect. The offline resolution answers "which identity is actually
        // in effect now" — `envVar` is set exactly when an env override won
        // over the default.
        const effectiveIdentity = await resolveTeamIdentity(
            {
                account: undefined,
                defaultTeam: { id: team.id, name: team.name },
                resolveAgainstBackend: false,
            },
            context,
        );
        if (effectiveIdentity?.envVar !== undefined) {
            writeLine(
                context.stdout,
                context.translator.t("team.use.envOverrideHint", {
                    envVar: effectiveIdentity.envVar,
                }),
            );
        }
    },
};
