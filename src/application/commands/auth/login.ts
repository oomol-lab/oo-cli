import type {
    CliCommandDefinition,
    CliExecutionContext,
} from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import {
    requestAuthAccountWithSessionToken,
    startAuthLoginSession,
} from "../../auth/login-flow.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { upsertAuthAccount } from "../../schemas/auth.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { writeLine } from "../shared/output.ts";
import {
    formatAuthStrong,
    writeAuthBlock,
} from "./shared.ts";

const loginUrlColor = "#c09ff5";
const defaultAuthEndpoint = "oomol.com";

const authLoginCommandInputSchema = z.object({
    sessionToken: z.string().trim().min(1).optional(),
});

export type AuthLoginCommandInput = z.output<typeof authLoginCommandInputSchema>;

export const authLoginCommand: CliCommandDefinition<AuthLoginCommandInput> = {
    name: "login",
    summaryKey: "commands.auth.login.summary",
    descriptionKey: "commands.auth.login.description",
    options: [
        {
            name: "sessionToken",
            longFlag: "--session-token",
            valueName: "session-token",
            descriptionKey: "options.sessionToken",
        },
    ],
    inputSchema: authLoginCommandInputSchema,
    mapInputError: () => new CliUserError("errors.auth.sessionTokenRequired", 2),
    handler: async (input: AuthLoginCommandInput, context) => {
        const authEndpoint = readAuthEndpoint(context.env);
        const loginMethod = input.sessionToken === undefined
            ? "device_login" as const
            : "session_token" as const;

        context.telemetry?.recordProperties({ auth_method: loginMethod });

        const account = loginMethod === "device_login"
            ? await runDeviceLogin(authEndpoint, context)
            : await requestAuthAccountWithSessionToken({
                    endpoint: authEndpoint,
                    fetcher: context.fetcher,
                    logger: context.logger,
                    sessionToken: input.sessionToken!,
                    translator: context.translator,
                });

        const nextAuthFile = await context.authStore.update(authFile =>
            upsertAuthAccount(authFile, account),
        );
        context.telemetry?.recordProperties({
            account_count_bucket: bucketTelemetryCount(nextAuthFile.auth.length),
        });
        context.logger.info(
            {
                accountId: account.id,
                endpoint: account.endpoint,
                loginMethod,
                name: account.name,
            },
            loginMethod === "device_login"
                ? "Auth account persisted after device login."
                : "Auth account persisted after fast login.",
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

async function runDeviceLogin(
    authEndpoint: string,
    context: CliExecutionContext,
): Promise<AuthAccount> {
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
        context.translator.t("auth.login.waiting"),
    );

    return session.waitForAccount();
}

function readAuthEndpoint(
    env: CliExecutionContext["env"],
): string {
    return env.OOMOL_ENDPOINT?.trim() || defaultAuthEndpoint;
}
