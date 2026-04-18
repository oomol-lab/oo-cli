import type {
    CliCommandDefinition,
    CliExecutionContext,
} from "../../contracts/cli.ts";

import { startAuthLoginSession } from "../../auth/login-flow.ts";
import { upsertAuthAccount } from "../../schemas/auth.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { writeLine } from "../shared/output.ts";
import {
    emptyAuthCommandInputSchema,
    formatAuthStrong,
    writeAuthBlock,
} from "./shared.ts";

const loginUrlColor = "#c09ff5";
const defaultAuthEndpoint = "oomol.com";

export const authLoginCommand: CliCommandDefinition = {
    name: "login",
    summaryKey: "commands.auth.login.summary",
    descriptionKey: "commands.auth.login.description",
    inputSchema: emptyAuthCommandInputSchema,
    handler: async (_, context) => {
        const authEndpoint = readAuthEndpoint(context.env);
        const session = await startAuthLoginSession({
            endpoint: authEndpoint,
            fetcher: context.fetcher,
            logger: context.logger,
            translator: context.translator,
        });
        const colors = createWriterColors(context.stdout);

        context.logger.debug(
            {
                authEndpoint,
                expiresInSeconds: session.expiresInSeconds,
            },
            "Auth device login session prepared.",
        );
        writeLine(
            context.stdout,
            context.translator.t("auth.login.openManually", {
                url: colors.hex(loginUrlColor)(session.verificationUrl),
            }),
        );
        writeLine(
            context.stdout,
            context.translator.t("auth.login.code", {
                code: colors.bold(session.code),
            }),
        );
        writeLine(
            context.stdout,
            context.translator.t("auth.login.waiting"),
        );

        const account = await session.waitForAccount();

        await context.authStore.update(authFile =>
            upsertAuthAccount(authFile, account),
        );
        context.logger.info(
            {
                accountId: account.id,
                endpoint: account.endpoint,
                name: account.name,
            },
            "Auth account persisted after device login.",
        );

        writeAuthBlock(context, {
            tone: "success",
            summary: context.translator.t("auth.account.loggedIn", {
                endpoint: formatAuthStrong(context, account.endpoint),
                name: formatAuthStrong(context, account.name),
            }),
            details: [
                {
                    label: context.translator.t("auth.status.activeAccount"),
                    value: "true",
                },
            ],
        });
    },
};

function readAuthEndpoint(
    env: CliExecutionContext["env"],
): string {
    return env.OOMOL_ENDPOINT?.trim() || defaultAuthEndpoint;
}
