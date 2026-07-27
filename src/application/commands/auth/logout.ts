import type { CliCommandDefinition } from "../../contracts/cli.ts";

import {
    buildEnvApiKeyAccount,
    reportOverriddenWrite,
} from "../../auth/identity.ts";
import { removeCurrentAuthAccount } from "../../schemas/auth.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { writeLine } from "../shared/output.ts";
import { emptyAuthCommandInputSchema } from "./shared.ts";

export const authLogoutCommand: CliCommandDefinition = {
    name: "logout",
    summaryKey: "commands.auth.logout.summary",
    descriptionKey: "commands.auth.logout.description",
    inputSchema: emptyAuthCommandInputSchema,
    handler: async (_, context) => {
        // OO_API_KEY, not auth.toml, is what authenticates every command here,
        // and this command cannot unset an environment variable. Removing the
        // saved account would leave the caller just as authenticated as before
        // while destroying state they never asked to lose, so do nothing and
        // say so.
        if (buildEnvApiKeyAccount(context.env) !== undefined) {
            reportOverriddenWrite(context, {
                summaryKey: "auth.logout.envOverrideNoop",
            });
            return;
        }

        let previousCurrentAuthId = "";
        let remainingSavedAccounts = 0;

        await context.authStore.update((authFile) => {
            previousCurrentAuthId = authFile.id;
            const nextAuthFile = removeCurrentAuthAccount(authFile);

            remainingSavedAccounts = nextAuthFile.auth.length;

            return nextAuthFile;
        });
        context.logger.info(
            {
                previousCurrentAuthId,
                remainingSavedAccounts,
            },
            "Current auth account was removed.",
        );
        context.telemetry?.recordProperties({
            account_count_bucket: bucketTelemetryCount(remainingSavedAccounts),
            credential_source: "file",
        });

        writeLine(
            context.stdout,
            context.translator.t("auth.logout.success"),
        );
    },
};
