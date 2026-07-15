import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import {
    getConfiguredIdentityTeam,
    unsetIdentityTeam,
} from "../../schemas/settings.ts";
import { writeLine } from "../shared/output.ts";

// Clears the default team identity (config `identity.team`), returning
// connector commands to the personal identity. Offline: it only rewrites local
// settings.
export const teamClearCommand: CliCommandDefinition = {
    name: "clear",
    summaryKey: "commands.team.clear.summary",
    descriptionKey: "commands.team.clear.description",
    inputSchema: z.object({}),
    handler: async (_input, context) => {
        const settings = await context.settingsStore.read();
        const hadConfiguredTeam
            = getConfiguredIdentityTeam(settings) !== undefined;

        if (!hadConfiguredTeam) {
            writeLine(
                context.stdout,
                context.translator.t("team.clear.alreadyPersonal"),
            );
            return;
        }

        await context.settingsStore.update(unsetIdentityTeam);

        context.logger.info(
            { teamConfigured: false },
            "Default team identity cleared.",
        );
        writeLine(context.stdout, context.translator.t("team.clear.success"));
    },
};
