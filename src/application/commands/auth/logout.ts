import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { removeCurrentAuthAccount } from "../../schemas/auth.ts";
import { emptyAuthCommandInputSchema, writeAuthLine } from "./shared.ts";

export const authLogoutCommand: CliCommandDefinition = {
    name: "logout",
    summaryKey: "commands.auth.logout.summary",
    descriptionKey: "commands.auth.logout.description",
    inputSchema: emptyAuthCommandInputSchema,
    handler: async (_, context) => {
        await context.authStore.update(authFile =>
            removeCurrentAuthAccount(authFile),
        );

        writeAuthLine(
            context,
            context.translator.t("auth.logout.success"),
        );
    },
};
