import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import type { AuthAccount } from "../../schemas/auth.ts";
import {
    emptyAuthCommandInputSchema,
    formatAuthStrong,
    readCurrentAuth,
    writeAuthBlock,
} from "./shared.ts";

export const authStatusCommand: CliCommandDefinition = {
    name: "status",
    summaryKey: "commands.auth.status.summary",
    descriptionKey: "commands.auth.status.description",
    inputSchema: emptyAuthCommandInputSchema,
    handler: async (_, context) => {
        const { authFile, currentAccount } = await readCurrentAuth(context);

        if (!currentAccount) {
            writeAuthBlock(context, {
                tone: authFile.id === "" ? "warning" : "danger",
                summary: context.translator.t(
                    authFile.id === ""
                        ? "auth.status.loggedOut"
                        : "auth.status.missing",
                ),
                details: authFile.id === ""
                    ? []
                    : [
                            {
                                label: context.translator.t("auth.status.accountId"),
                                value: authFile.id,
                            },
                        ],
            });
            return;
        }

        const apiKeyStatus = await readApiKeyStatus(currentAccount, context);
        writeAuthBlock(context, {
            tone: readAuthStatusTone(apiKeyStatus),
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
                    value: context.translator.t(readApiKeyStatusKey(apiKeyStatus)),
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

function readAuthStatusTone(
    apiKeyStatus: "invalid" | "request_failed" | "valid",
): "danger" | "success" | "warning" {
    switch (apiKeyStatus) {
        case "invalid":
            return "danger";
        case "request_failed":
            return "warning";
        case "valid":
            return "success";
    }
}

const apiKeyStatusKeys: Record<string, string> = {
    invalid: "auth.status.apiKeyInvalid",
    request_failed: "auth.status.apiKeyRequestFailed",
    valid: "auth.status.apiKeyValid",
};

function readApiKeyStatusKey(
    apiKeyStatus: "invalid" | "request_failed" | "valid",
): string {
    return apiKeyStatusKeys[apiKeyStatus] ?? "auth.status.apiKeyInvalid";
}
