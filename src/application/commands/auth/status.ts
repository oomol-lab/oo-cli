import type { AuthFileState } from "../../contracts/auth-store.ts";
import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import type { AuthAccount, AuthFile } from "../../schemas/auth.ts";

import type { ResolvedSelfHostedConnector } from "../shared/self-hosted-connector.ts";

import type {
    TeamIdentity,
    TeamIdentitySource,
    TeamNameStatus,
} from "../team/identity.ts";
import { z } from "zod";
import { readDefaultTeam } from "../../auth/default-team.ts";
import { resolveIdentity } from "../../auth/identity.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { probeOo } from "../shared/oo-request.ts";
import { writeLine } from "../shared/output.ts";
import { resolveSelfHostedConnectorTolerantly } from "../shared/self-hosted-connector.ts";
import {
    appendTeamIdentityStatus,
    formatTeamIdentityValue,
    resolveTeamIdentity,
    teamNameStatusForTelemetry,
} from "../team/identity.ts";
import {
    formatAuthStrong,
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

/**
 * Where the credential that commands actually use comes from. `env` means
 * OO_API_KEY short-circuited auth.toml, so no saved account is in effect.
 */
type CredentialSource = "env" | "file";

interface ActiveAccountStatus {
    account: AuthAccount;
    apiKeyStatus: ApiKeyStatus;
    source: CredentialSource;
}

interface ResolvedStatusIdentity {
    account: AuthAccount;
    source: CredentialSource;
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

// Present only when OO_API_KEY supplies the credential. The key itself is
// never emitted; the endpoint and the validation result are enough to explain
// which identity commands actually run as.
interface AuthStatusJsonEnvOverride {
    endpoint: string;
    apiKeyStatus: ApiKeyStatus;
}

// The default team identity in effect for team-scoped commands, resolved the
// same way `oo team current` resolves it: the OO_TEAM_ID / OO_TEAM_NAME env
// override outranks the account's saved default.
//
// `status` reports how the backend lookup ended and is `null` when none was
// attempted — only env-selected identities are looked up (both directions),
// a saved name never is. `envVar` is deliberately not part of this payload:
// it is a hint for the text renderer, not a fact about the identity.
interface AuthStatusJsonTeam {
    name: string | null;
    id: string | null;
    source: TeamIdentitySource;
    status: TeamNameStatus | null;
}

type AuthStatusJsonPayload
    = | {
        status: "logged-in";
        activeAccountId: string;
        accounts: AuthStatusJsonAccount[];
        team?: AuthStatusJsonTeam;
        envOverride?: AuthStatusJsonEnvOverride;
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

export const authStatusCommand: CliCommandDefinition = {
    name: "status",
    aliases: ["info"],
    summaryKey: "commands.auth.status.summary",
    descriptionKey: "commands.auth.status.description",
    output: "standard",
    inputSchema: z.object({}),
    handler: async (_input, context) => {
        // Tolerant lookup: a broken connector.toml must not take down the
        // whole status report; the block is simply omitted.
        const selfHostedConnector = await resolveSelfHostedConnectorTolerantly(context);
        // Status must describe the identity commands actually run as, which is
        // what requireIdentity() resolves — not the raw auth.toml contents.
        // Reporting the file while OO_API_KEY/OO_ENDPOINT redirect every other
        // command is how status ends up naming the wrong account, the wrong
        // endpoint, and validating the wrong key.
        const { authFile, fileState, identity } = await resolveStatusState(context);
        const defaultTeam = await readDefaultTeam(context);

        // Status is the first command a user runs to diagnose auth problems,
        // so an unreadable auth.toml must not take the report down — it is
        // reported instead, and the saved-accounts list simply stays empty.
        if (fileState === "corrupt") {
            const corruptWarning = context.translator.t(
                "auth.status.authFileCorrupt",
                { path: context.authStore.getFilePath() },
            );

            if (context.output.format === "json") {
                // stdout must stay valid JSON; diagnostics go to stderr.
                writeLine(context.stderr, corruptWarning);
            }
            else {
                writeAuthBlock(context, {
                    tone: "warning",
                    summary: corruptWarning,
                });
            }
        }

        // The key validation and the team lookup answer independent
        // questions, so they go out together. Sequencing them would double the
        // command's latency to report the same two facts.
        const [apiKeyStatus, teamIdentity] = await Promise.all([
            identity === undefined
                ? undefined
                : readApiKeyStatus(identity.account, context),
            resolveTeamIdentity(
                {
                    account: identity?.account,
                    defaultTeam,
                    resolveAgainstBackend: true,
                    resolveCurrentName: true,
                },
                context,
            ),
        ]);

        context.telemetry?.recordProperties({
            account_count_bucket: bucketTelemetryCount(authFile.auth.length),
            credential_source: identity?.source ?? "none",
            team_source: teamIdentity?.source ?? "none",
            team_status: teamNameStatusForTelemetry(teamIdentity),
        });

        const activeStatus: ActiveAccountStatus | undefined
            = identity === undefined || apiKeyStatus === undefined
                ? undefined
                : { ...identity, apiKeyStatus };

        context.output.emit(
            buildAuthStatusJsonPayload(
                authFile,
                activeStatus,
                teamIdentity,
                selfHostedConnector,
            ),
            () => {
                writeAuthStatusText(context, authFile, activeStatus, teamIdentity);
                writeSelfHostedConnectorText(context, selfHostedConnector);
            },
        );
    },
};

/**
 * Resolves what to report: the identity commands actually run as, plus the
 * full auth file for the saved-accounts list. The list is a display concern
 * of status alone, so the file is read tolerantly here instead of widening
 * ResolvedIdentity — status must never create a missing auth.toml or fail on
 * a corrupt one; `fileState` says what the tolerant reads observed.
 */
async function resolveStatusState(
    context: CliExecutionContext,
): Promise<{
    authFile: AuthFile;
    fileState: AuthFileState;
    identity: ResolvedStatusIdentity | undefined;
}> {
    // Independent reads, so they go out together; the window between them is
    // a display-only concern (the list could lag the identity by one write).
    const [identity, { authFile, fileState }] = await Promise.all([
        resolveIdentity(context),
        context.authStore.readTolerantState(),
    ]);

    return {
        authFile,
        fileState,
        identity: identity.account !== undefined && identity.source !== "none"
            ? { account: identity.account, source: identity.source }
            : undefined,
    };
}

function buildAuthStatusJsonPayload(
    authFile: AuthFile,
    activeStatus: ActiveAccountStatus | undefined,
    teamIdentity: TeamIdentity | undefined,
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
    // Only a file-sourced identity can mark a saved account active; the
    // OO_API_KEY account is synthetic and never appears in accounts[].
    const activeId = activeStatus?.source === "file"
        ? activeStatus.account.id
        : undefined;
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
            // `envVar` is intentionally dropped: it explains the text hint, not
            // the identity, and would not survive a source change.
            ...(teamIdentity === undefined
                ? {}
                : {
                        team: {
                            name: teamIdentity.name,
                            id: teamIdentity.id,
                            source: teamIdentity.source,
                            status: teamIdentity.status,
                        },
                    }),
            ...(activeStatus.source === "env"
                ? {
                        envOverride: {
                            endpoint: activeStatus.account.endpoint,
                            apiKeyStatus: activeStatus.apiKeyStatus,
                        },
                    }
                : {}),
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

// Renders the default-team detail row. The value spells out the identity in
// effect: the account default under its current name (with the reason when
// the refresh could not confirm it), an env override with the variable that
// supplies it, the server-side default by name when the backend reported one,
// or the bare server-side default when it reported none.
function formatStatusTeamDetail(
    context: CliExecutionContext,
    teamIdentity: TeamIdentity | undefined,
): { label: string; value: string } {
    const label = context.translator.t("auth.status.team");

    if (teamIdentity === undefined) {
        return {
            label,
            value: context.translator.t("auth.status.teamServerDefault"),
        };
    }

    const teamValue = formatTeamIdentityValue(teamIdentity, context.translator);

    if (teamIdentity.source === "backend_default") {
        return {
            label,
            value: context.translator.t("auth.status.teamBackendDefault", {
                team: teamValue,
            }),
        };
    }

    return {
        label,
        value: appendTeamIdentityStatus(
            teamIdentity.envVar === undefined
                ? teamValue
                : context.translator.t("auth.status.teamEnvOverride", {
                        team: teamValue,
                        envVar: teamIdentity.envVar,
                    }),
            teamIdentity,
            context.translator,
        ),
    };
}

function writeAuthStatusText(
    context: CliExecutionContext,
    authFile: AuthFile,
    activeStatus: ActiveAccountStatus | undefined,
    teamIdentity: TeamIdentity | undefined,
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

    const { account, apiKeyStatus, source } = activeStatus;
    const statusConfig = apiKeyStatusConfig[apiKeyStatus];
    const apiKeyStatusDetail = {
        label: context.translator.t("auth.status.apiKeyStatus"),
        value: context.translator.t(statusConfig.translationKey),
    };
    const teamDetail = formatStatusTeamDetail(context, teamIdentity);

    if (source === "env") {
        writeAuthBlock(context, {
            tone: statusConfig.tone,
            summary: context.translator.t("auth.status.envOverride", {
                endpoint: formatAuthStrong(context, account.endpoint),
            }),
            details: [apiKeyStatusDetail, teamDetail],
        });

        // Without this the accounts list below reads as a bug: every saved
        // account is unmarked because none of them is in effect.
        if (authFile.auth.length > 0) {
            writeLine(
                context.stdout,
                context.translator.t("auth.status.savedAccountsIgnored"),
            );
        }

        writeAuthAccountsList(context, authFile, undefined);
        return;
    }

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
            apiKeyStatusDetail,
            teamDetail,
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
    const probe = await probeOo({
        authorization: account.apiKey,
        context,
        host: { endpoint: account.endpoint, service: "api" },
        label: "Auth status",
        logFields: {
            accountId: account.id,
            endpoint: account.endpoint,
        },
        path: "/v1/users/profile",
    });

    if (probe.kind !== "response") {
        return probe.kind === "failed_sandbox" ? "request_failed_sandbox" : "request_failed";
    }

    // Any responding status is a verdict about the key, not the gateway: only
    // 200 proves the key; everything else reads as rejected.
    return probe.status === 200 ? "valid" : "invalid";
}
