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
        const session = await startAuthLoginSession({
            logger: context.logger,
            translator: context.translator,
        });
        const loginUrl = createAuthLoginUrl(context, session.redirectUrl);

        context.logger.debug(
            {
                authEndpoint: readAuthEndpoint(context.env),
                redirectUrl: session.redirectUrl,
            },
            "Auth login URL prepared.",
        );
        writeLine(
            context.stdout,
            context.translator.t("auth.login.openManually", {
                url: formatLoginUrl(context, loginUrl.toString()),
            }),
        );
        writeLine(
            context.stdout,
            context.translator.t("auth.login.waitingForBrowser"),
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
            "Auth account persisted after browser login.",
        );

        writeAuthBlock(context, {
            tone: "success",
            summary: context.translator.t("auth.login.success", {
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

function formatLoginUrl(
    context: CliExecutionContext,
    url: string,
): string {
    const colors = createWriterColors(context.stdout);

    return colors.hex(loginUrlColor)(url);
}

function createAuthLoginUrl(
    context: Pick<CliExecutionContext, "env">,
    redirectUrl: string,
): URL {
    const loginUrl = new URL(
        `https://api.${readAuthEndpoint(context.env)}/v1/auth/redirect`,
    );

    loginUrl.searchParams.set("redirect", redirectUrl);
    loginUrl.searchParams.set("cli_login", "true");
    return loginUrl;
}

function readAuthEndpoint(
    env: CliExecutionContext["env"],
): string {
    const configuredEndpoint = env.OOMOL_ENDPOINT?.trim();

    if (!configuredEndpoint) {
        return defaultAuthEndpoint;
    }

    return configuredEndpoint;
}
