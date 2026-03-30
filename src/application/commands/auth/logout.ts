import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { removeCurrentAuthAccount } from "../../schemas/auth.ts";
import { writeLine } from "../shared/output.ts";
import { emptyAuthCommandInputSchema } from "./shared.ts";

export const authLogoutCommand: CliCommandDefinition = {
    name: "logout",
    summaryKey: "commands.auth.logout.summary",
    descriptionKey: "commands.auth.logout.description",
    inputSchema: emptyAuthCommandInputSchema,
    handler: async (_, context) => {
        let previousCurrentAuthId = "";
        let remainingSavedAccounts = 0;

        await context.authStore.update((authFile) => {
            previousCurrentAuthId = authFile.id;
            const nextAuthFile = removeCurrentAuthAccount(authFile);

            remainingSavedAccounts = nextAuthFile.auth.length;

            return nextAuthFile;
        },
        );
        context.logger.info(
            {
                previousCurrentAuthId,
                remainingSavedAccounts,
            },
            "Current auth account was removed.",
        );

        writeLine(
            context.stdout,
            context.translator.t("auth.logout.success"),
        );
    },
};
