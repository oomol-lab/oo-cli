import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import type { AuthAccount, AuthFile } from "../../schemas/auth.ts";

import type { ResolvedSelfHostedConnector } from "../shared/self-hosted-connector.ts";
import { z } from "zod";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { isNetworkRestrictedSandboxError } from "../shared/request.ts";
import { resolveSelfHostedConnectorTolerantly } from "../shared/self-hosted-connector.ts";
import {
    formatAuthStrong,
    readCurrentAuth,
    writeAuthBlock,
} from "./shared.ts";

const apiKeyStatusConfig = {
    invalid: { tone: "danger", translationKey: "auth.status.apiKeyInvalid" },
    request_failed: { tone: "warning", translationKey: "auth.status.apiKeyRequestFailed" },
    request_failed_sandbox: {
        tone: "warning",
        translationKey: "auth.status.apiKeyRequestFailedSandbox",
    },
    valid: { tone: "success", translationKey: "auth.status.apiKeyValid" },
} as const;

type ApiKeyStatus = keyof typeof apiKeyStatusConfig;

interface ActiveAccountStatus {
    account: AuthAccount;
    apiKeyStatus: ApiKeyStatus;
}

const authStatusFormatValues = ["json"] as const;

interface AuthStatusInput {
    format?: (typeof authStatusFormatValues)[number];
    showSchemaVersion?: boolean;
}

interface AuthStatusJsonAccount {
    id: string;
    name: string;
    endpoint: string;
    active: boolean;
    apiKeyStatus?: ApiKeyStatus;
}

// The token itself is never emitted; only its presence.
interface AuthStatusJsonConnector {
    url: string;
    tokenConfigured: boolean;
    source: "env" | "file";
}

type AuthStatusJsonPayload
    = | {
        status: "logged-in";
        activeAccountId: string;
        accounts: AuthStatusJsonAccount[];
        connector?: AuthStatusJsonConnector;
    }
    | {
        status: "logged-out";
        activeAccountId: null;
        accounts: AuthStatusJsonAccount[];
        connector?: AuthStatusJsonConnector;
    }
    | {
        status: "active-account-missing";
        activeAccountId: null;
        missingAccountId: string;
        accounts: AuthStatusJsonAccount[];
        connector?: AuthStatusJsonConnector;
    };

export const authStatusCommand: CliCommandDefinition<AuthStatusInput> = {
    name: "status",
    aliases: ["info"],
    summaryKey: "commands.auth.status.summary",
    descriptionKey: "commands.auth.status.description",
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        format: z.enum(authStatusFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const { authFile, currentAccount } = await readCurrentAuth(context);
        // Tolerant lookup: a broken connector.toml must not take down the
        // whole status report; the block is simply omitted.
        const selfHostedConnector = await resolveSelfHostedConnectorTolerantly(context);

        context.telemetry?.recordProperties({
            account_count_bucket: bucketTelemetryCount(authFile.auth.length),
        });

        const activeStatus: ActiveAccountStatus | undefined
            = currentAccount === undefined
                ? undefined
                : {
                        account: currentAccount,
                        apiKeyStatus: await readApiKeyStatus(currentAccount, context),
                    };

        if (input.format === "json") {
            writeJsonOutput(
                context.stdout,
                buildAuthStatusJsonPayload(authFile, activeStatus, selfHostedConnector),
                { showSchemaVersion: input.showSchemaVersion },
            );
            return;
        }

        writeAuthStatusText(context, authFile, activeStatus);
        writeSelfHostedConnectorText(context, selfHostedConnector);
    },
};

function buildAuthStatusJsonPayload(
    authFile: AuthFile,
    activeStatus: ActiveAccountStatus | undefined,
    selfHostedConnector: ResolvedSelfHostedConnector | undefined,
): AuthStatusJsonPayload {
    const connector: { connector?: AuthStatusJsonConnector }
        = selfHostedConnector === undefined
            ? {}
            : {
                    connector: {
                        url: selfHostedConnector.config.url,
                        tokenConfigured: selfHostedConnector.config.token !== undefined,
                        source: selfHostedConnector.source,
                    },
                };
    const activeId = activeStatus?.account.id;
    const accounts: AuthStatusJsonAccount[] = authFile.auth.map((account) => {
        const isActive = account.id === activeId;
        return {
            id: account.id,
            name: account.name,
            endpoint: account.endpoint,
            active: isActive,
            ...(isActive && activeStatus !== undefined
                ? { apiKeyStatus: activeStatus.apiKeyStatus }
                : {}),
        };
    });

    if (activeStatus !== undefined) {
        return {
            status: "logged-in",
            activeAccountId: activeStatus.account.id,
            accounts,
            ...connector,
        };
    }

    if (authFile.id !== "") {
        return {
            status: "active-account-missing",
            activeAccountId: null,
            missingAccountId: authFile.id,
            accounts,
            ...connector,
        };
    }

    return {
        status: "logged-out",
        activeAccountId: null,
        accounts,
        ...connector,
    };
}

function writeSelfHostedConnectorText(
    context: CliExecutionContext,
    selfHostedConnector: ResolvedSelfHostedConnector | undefined,
): void {
    if (selfHostedConnector === undefined) {
        return;
    }

    writeAuthBlock(context, {
        tone: "success",
        summary: context.translator.t("auth.status.selfHostedConnector", {
            url: formatAuthStrong(context, selfHostedConnector.config.url),
        }),
        details: [
            {
                label: context.translator.t("auth.status.selfHostedConnectorToken"),
                value: selfHostedConnector.config.token === undefined
                    ? context.translator.t("auth.status.selfHostedConnectorToken.no")
                    : context.translator.t("auth.status.selfHostedConnectorToken.yes"),
            },
            {
                label: context.translator.t("auth.status.selfHostedConnectorSource"),
                value: selfHostedConnector.source,
            },
        ],
    });
}

function writeAuthStatusText(
    context: CliExecutionContext,
    authFile: AuthFile,
    activeStatus: ActiveAccountStatus | undefined,
): void {
    if (activeStatus === undefined) {
        if (authFile.id !== "") {
            writeAuthBlock(context, {
                tone: "danger",
                summary: context.translator.t("auth.account.activeAccountMissing"),
                details: [
                    {
                        label: context.translator.t("auth.status.accountId"),
                        value: authFile.id,
                    },
                ],
            });
            writeAuthAccountsList(context, authFile, undefined);
            return;
        }

        writeAuthBlock(context, {
            tone: "warning",
            summary: context.translator.t("auth.status.loggedOut"),
        });
        writeAuthAccountsList(context, authFile, undefined);
        return;
    }

    const { account, apiKeyStatus } = activeStatus;
    const statusConfig = apiKeyStatusConfig[apiKeyStatus];

    writeAuthBlock(context, {
        tone: statusConfig.tone,
        summary: context.translator.t("auth.account.loggedIn", {
            endpoint: formatAuthStrong(context, account.endpoint),
            name: formatAuthStrong(context, account.name),
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
    writeAuthAccountsList(context, authFile, account.id);
}

function writeAuthAccountsList(
    context: CliExecutionContext,
    authFile: AuthFile,
    activeAccountId: string | undefined,
): void {
    if (authFile.auth.length === 0) {
        return;
    }

    const colors = createWriterColors(context.stdout);
    const label = context.translator.t("auth.status.accountsLabel");
    const activeMarker = context.translator.t("auth.status.accountActive");

    context.stdout.write(`  ${colors.dim("-")} ${label}:\n`);

    for (const entry of authFile.auth) {
        const isActive = entry.id === activeAccountId;
        const namePart = isActive
            ? `${colors.bold(entry.name)} ${colors.green(`[${activeMarker}]`)}`
            : colors.bold(entry.name);

        context.stdout.write(
            `    ${colors.dim("*")} ${namePart} ${colors.dim(`(${entry.endpoint})`)}\n`,
        );
    }
}

async function readApiKeyStatus(
    account: AuthAccount,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<ApiKeyStatus> {
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
        if (isNetworkRestrictedSandboxError(error)) {
            return "request_failed_sandbox";
        }
        return "request_failed";
    }
}
