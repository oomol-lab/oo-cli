import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import type { AuthAccount } from "../../schemas/auth.ts";
import {
    emptyAuthCommandInputSchema,
    formatAuthStrong,
    readCurrentAuth,
    writeAuthBlock,
} from "./shared.ts";

const apiKeyStatusConfig = {
    invalid: { tone: "danger" as const, translationKey: "auth.status.apiKeyInvalid" as const },
    request_failed: { tone: "warning" as const, translationKey: "auth.status.apiKeyRequestFailed" as const },
    valid: { tone: "success" as const, translationKey: "auth.status.apiKeyValid" as const },
} as const;

export const authStatusCommand: CliCommandDefinition = {
    name: "status",
    summaryKey: "commands.auth.status.summary",
    descriptionKey: "commands.auth.status.description",
    inputSchema: emptyAuthCommandInputSchema,
    handler: async (_, context) => {
        const { authFile, currentAccount } = await readCurrentAuth(context);

        if (!currentAccount) {
            const hasStaleId = authFile.id !== "";

            if (hasStaleId) {
                writeAuthBlock(context, {
                    tone: "danger",
                    summary: context.translator.t("auth.status.missing"),
                    details: [
                        {
                            label: context.translator.t("auth.status.accountId"),
                            value: authFile.id,
                        },
                    ],
                });
            }
            else {
                writeAuthBlock(context, {
                    tone: "warning",
                    summary: context.translator.t("auth.status.loggedOut"),
                });
            }
            return;
        }

        const apiKeyStatus = await readApiKeyStatus(currentAccount, context);
        const statusConfig = apiKeyStatusConfig[apiKeyStatus];
        writeAuthBlock(context, {
            tone: statusConfig.tone,
            summary: context.translator.t("auth.status.loggedIn", {
                endpoint: formatAuthStrong(context, currentAccount.endpoint),
                name: formatAuthStrong(context, currentAccount.name),
            }),
            details: [
                {
                    label: context.translator.t("auth.status.activeAccount"),
                    value: "true",
                },
                {
                    label: context.translator.t("auth.status.apiKeyStatus"),
                    value: context.translator.t(statusConfig.translationKey),
                },
            ],
        });
    },
};

async function readApiKeyStatus(
    account: AuthAccount,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<"invalid" | "request_failed" | "valid"> {
    const requestStartedAt = Date.now();
    const requestUrl = `https://api.${account.endpoint}/v1/users/profile`;

    context.logger.debug(
        {
            accountId: account.id,
            endpoint: account.endpoint,
        },
        "Auth status request started.",
    );

    try {
        const response = await context.fetcher(requestUrl, {
            headers: {
                Authorization: account.apiKey,
            },
        });
        const apiKeyStatus = response.status === 200 ? "valid" : "invalid";

        context.logger.debug(
            {
                accountId: account.id,
                durationMs: Date.now() - requestStartedAt,
                endpoint: account.endpoint,
                status: response.status,
                validity: apiKeyStatus,
            },
            "Auth status request completed.",
        );

        return apiKeyStatus;
    }
    catch (error) {
        context.logger.warn(
            {
                accountId: account.id,
                durationMs: Date.now() - requestStartedAt,
                endpoint: account.endpoint,
                err: error,
            },
            "Auth status request failed unexpectedly.",
        );
        return "request_failed";
    }
}
