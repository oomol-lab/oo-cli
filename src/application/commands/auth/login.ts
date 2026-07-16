import type {
    CliCommandDefinition,
    CliExecutionContext,
} from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import {
    requestAuthAccountWithApiKey,
    requestAuthAccountWithSessionToken,
    startAuthLoginSession,
} from "../../auth/login-flow.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { upsertAuthAccount } from "../../schemas/auth.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { buildEnvApiKeyAccount } from "../shared/auth-env-override.ts";
import { writeLine } from "../shared/output.ts";
import { resolveSelfHostedConnectorTolerantly } from "../shared/self-hosted-connector.ts";
import {
    formatAuthStrong,
    writeAuthBlock,
} from "./shared.ts";

const loginUrlColor = "#c09ff5";
const defaultAuthEndpoint = "oomol.com";

type LoginMethod = "api_key" | "device_login" | "session_token";

const persistedLogMessages = {
    api_key: "Auth account persisted after api key login.",
    device_login: "Auth account persisted after device login.",
    session_token: "Auth account persisted after fast login.",
} as const satisfies Record<LoginMethod, string>;

const authLoginCommandInputSchema = z.object({
    apiKey: z.string().trim().min(1).optional(),
    sessionToken: z.string().trim().min(1).optional(),
}).refine(
    input => !(input.apiKey !== undefined && input.sessionToken !== undefined),
    { message: "Use only one of --api-key or --session-token." },
);

export type AuthLoginCommandInput = z.output<typeof authLoginCommandInputSchema>;

export const authLoginCommand: CliCommandDefinition<AuthLoginCommandInput> = {
    name: "login",
    summaryKey: "commands.auth.login.summary",
    descriptionKey: "commands.auth.login.description",
    options: [
        {
            name: "apiKey",
            longFlag: "--api-key",
            valueName: "api-key",
            descriptionKey: "options.apiKey",
        },
        {
            name: "sessionToken",
            longFlag: "--session-token",
            valueName: "session-token",
            descriptionKey: "options.sessionToken",
        },
    ],
    inputSchema: authLoginCommandInputSchema,
    mapInputError: (_error, rawInput) => mapLoginInputError(rawInput),
    handler: async (input: AuthLoginCommandInput, context) => {
        const authEndpoint = readAuthEndpoint(context.env);
        const loginMethod = resolveLoginMethod(input);

        context.telemetry?.recordProperties({ auth_method: loginMethod });

        const account = await resolveAuthAccount(
            loginMethod,
            input,
            authEndpoint,
            context,
        );

        const nextAuthFile = await context.authStore.update(authFile =>
            upsertAuthAccount(authFile, account),
        );
        const hasEnvOverride = buildEnvApiKeyAccount(context.env) !== undefined;

        context.telemetry?.recordProperties({
            account_count_bucket: bucketTelemetryCount(nextAuthFile.auth.length),
            credential_source: hasEnvOverride ? "env" : "file",
        });
        context.logger.info(
            {
                accountId: account.id,
                endpoint: account.endpoint,
                loginMethod,
                name: account.name,
            },
            persistedLogMessages[loginMethod],
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

        // The account is saved, but OO_API_KEY still outranks it everywhere, so
        // the login block above would otherwise imply an identity that no
        // command actually uses.
        if (hasEnvOverride) {
            writeLine(
                context.stdout,
                context.translator.t("auth.login.envOverrideHint"),
            );
        }

        // Connector routing does not change with this login: a configured
        // self-hosted connector keeps handling connector commands, which is
        // easy to miss right after logging into an OOMOL account. Tolerant
        // lookup: login already succeeded, so a broken connector.toml must not
        // flip the exit code.
        const selfHostedConnector = await resolveSelfHostedConnectorTolerantly(context);

        if (selfHostedConnector !== undefined) {
            // `oo connector logout` only removes the persisted configuration;
            // an env-driven connector gets the OO_CONNECTOR_URL wording.
            writeLine(
                context.stdout,
                context.translator.t(
                    selfHostedConnector.source === "env"
                        ? "auth.login.selfHostedConnectorHintEnv"
                        : "auth.login.selfHostedConnectorHint",
                    {
                        url: selfHostedConnector.config.url,
                    },
                ),
            );
        }
    },
};

function resolveLoginMethod(input: AuthLoginCommandInput): LoginMethod {
    if (input.apiKey !== undefined) {
        return "api_key";
    }

    if (input.sessionToken !== undefined) {
        return "session_token";
    }

    return "device_login";
}

async function resolveAuthAccount(
    loginMethod: LoginMethod,
    input: AuthLoginCommandInput,
    authEndpoint: string,
    context: CliExecutionContext,
): Promise<AuthAccount> {
    switch (loginMethod) {
        case "api_key":
            return await requestAuthAccountWithApiKey({
                apiKey: input.apiKey!,
                endpoint: authEndpoint,
                fetcher: context.fetcher,
                logger: context.logger,
                translator: context.translator,
            });
        case "device_login":
            return await runDeviceLogin(authEndpoint, context);
        case "session_token":
            return await requestAuthAccountWithSessionToken({
                endpoint: authEndpoint,
                fetcher: context.fetcher,
                logger: context.logger,
                sessionToken: input.sessionToken!,
                translator: context.translator,
            });
    }
}

function mapLoginInputError(
    rawInput: Record<string, unknown>,
): CliUserError {
    const hasApiKey = typeof rawInput.apiKey === "string";
    const hasSessionToken = typeof rawInput.sessionToken === "string";

    if (hasApiKey && hasSessionToken) {
        return new CliUserError("errors.auth.loginMethodConflict", 2);
    }

    if (hasApiKey) {
        return new CliUserError("errors.auth.apiKeyRequired", 2);
    }

    return new CliUserError("errors.auth.sessionTokenRequired", 2);
}

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
        context.translator.t("auth.login.openManually"),
    );
    writeLine(
        context.stdout,
        colors.hex(loginUrlColor)(session.verificationUrl),
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
