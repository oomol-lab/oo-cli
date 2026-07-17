import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { setIdentityTeam } from "../../schemas/settings.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { writeLine } from "../shared/output.ts";
import {
    readTeamEnvOverride,
    teamEnvOverrideVariableName,
} from "../shared/team-env-override.ts";
import { listMemberTeams } from "./shared.ts";

interface TeamUseInput {
    name: string;
}

// Sets the default team identity (config `identity.team`) after confirming the
// account is actually a member of it. The membership check is the value over a
// bare `oo config set identity.team`: it rejects typos and stale names up front
// instead of surfacing them later on a connector run.
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

        const account = await requireCurrentAccount(context);
        const teams = await listMemberTeams(account, context);

        if (!teams.some(team => team.name === name)) {
            throw new CliUserError("errors.team.notAccessible", 1, {
                team: name,
            });
        }

        await context.settingsStore.update(settings =>
            setIdentityTeam(settings, name),
        );

        context.logger.info(
            { teamConfigured: true },
            "Default team identity persisted.",
        );
        writeLine(
            context.stdout,
            context.translator.t("team.use.success", { team: name }),
        );

        // Mirrors `oo auth login` under OO_API_KEY: the default is saved, but
        // the env override keeps outranking it, so say so instead of letting
        // the success line imply the new default is in effect.
        const envOverride = readTeamEnvOverride(context.env);
        if (envOverride !== undefined) {
            writeLine(
                context.stdout,
                context.translator.t("team.use.envOverrideHint", {
                    envVar: teamEnvOverrideVariableName(envOverride),
                }),
            );
        }
    },
};
