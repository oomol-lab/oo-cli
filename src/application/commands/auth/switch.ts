import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { CliUserError } from "../../contracts/cli.ts";
import { getNextAuthAccount, setCurrentAuthId } from "../../schemas/auth.ts";
import {
    emptyAuthCommandInputSchema,
    formatAuthStrong,
    writeAuthBlock,
} from "./shared.ts";

export const authSwitchCommand: CliCommandDefinition = {
    name: "switch",
    summaryKey: "commands.auth.switch.summary",
    descriptionKey: "commands.auth.switch.description",
    inputSchema: emptyAuthCommandInputSchema,
    handler: async (_, context) => {
        const authFile = await context.authStore.read();
        const account = getNextAuthAccount(authFile);

        if (account === undefined) {
            throw new CliUserError("errors.auth.noSavedAccounts", 1);
        }

        await context.authStore.write(setCurrentAuthId(authFile, account.id));
        writeAuthBlock(context, {
            tone: "success",
            summary: context.translator.t("auth.switch.success", {
                endpoint: account.endpoint,
                name: formatAuthStrong(context, account.name),
            }),
        });
    },
};
