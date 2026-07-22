import type {
    CliCommandDefinition,
    CliExecutionContext,
} from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import type { TeamView } from "../team/shared.ts";

import { z } from "zod";
import {
    requestAuthAccountWithApiKey,
    requestAuthAccountWithSessionToken,
    startAuthLoginSession,
} from "../../auth/login-flow.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { upsertAuthAccount } from "../../schemas/auth.ts";
import {
    getConfiguredIdentityTeam,
    setIdentityTeam,
} from "../../schemas/settings.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { buildEnvApiKeyAccount } from "../shared/auth-env-override.ts";
import { writeLine } from "../shared/output.ts";
import { resolveSelfHostedConnectorTolerantly } from "../shared/self-hosted-connector.ts";
import {
    readTeamEnvOverride,
    teamEnvOverrideVariableName,
} from "../shared/team-env-override.ts";
import { listMemberTeams } from "../team/shared.ts";
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
    team: z.string().trim().min(1).optional(),
}).refine(
    input => !(input.apiKey !== undefined && input.sessionToken !== undefined),
    { message: "Use only one of --api-key or --session-token." },
);

// Which mechanism decided the default team after login. `flag` is an explicit
// `--team`, `kept_config` preserves a still-valid `identity.team`,
// `system_default` adopts the backend-provisioned team, `none` found nothing
// to adopt, and `unresolved` means the membership request failed.
type LoginTeamSelection
    = "flag" | "kept_config" | "none" | "system_default" | "unresolved";

// How many team names the multi-team hint spells out before truncating with
// an ellipsis.
const loginTeamHintLimit = 5;

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
        {
            name: "team",
            longFlag: "--team",
            valueName: "name",
            descriptionKey: "options.loginTeam",
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

        await applyLoginTeamIdentity(account, input.team, context);

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

    // A blank `--team` is its own input error; without this check it would be
    // misreported as a missing api key / session token below.
    if (typeof rawInput.team === "string" && rawInput.team.trim() === "") {
        return new CliUserError("errors.team.nameEmpty", 2);
    }

    if (hasApiKey) {
        return new CliUserError("errors.auth.apiKeyRequired", 2);
    }

    return new CliUserError("errors.auth.sessionTokenRequired", 2);
}

// Persists the default team identity (`identity.team`) right after login so
// later commands run as a team by default. An explicit `--team` must fail
// loudly (the caller asked for exactly that team), while the implicit flow is
// tolerant: login already succeeded, so a failed membership request only
// prints a hint instead of flipping the exit code.
async function applyLoginTeamIdentity(
    account: AuthAccount,
    requestedTeam: string | undefined,
    context: CliExecutionContext,
): Promise<void> {
    let teams: TeamView[];

    try {
        teams = await listMemberTeams(account, context);
    }
    catch (error) {
        if (requestedTeam !== undefined) {
            throw error;
        }

        context.telemetry?.recordProperties({
            team_selection: "unresolved" satisfies LoginTeamSelection,
        });
        context.logger.warn(
            { err: error },
            "Login team membership request failed; default team unchanged.",
        );
        writeLine(
            context.stdout,
            context.translator.t("auth.login.teamUnresolved"),
        );
        return;
    }

    const selection = await resolveLoginTeamSelection(
        requestedTeam,
        teams,
        context,
    );

    context.telemetry?.recordProperties({
        team_count_bucket: bucketTelemetryCount(teams.length),
        team_selection: selection.kind,
    });

    if (selection.team !== undefined) {
        writeLine(
            context.stdout,
            context.translator.t("auth.login.teamDefault", {
                team: selection.team,
            }),
        );
    }

    if (teams.length > 1) {
        writeLine(
            context.stdout,
            context.translator.t("auth.login.teamOverview", {
                count: teams.length,
                teams: formatLoginTeamNames(teams),
            }),
        );
    }

    // Mirrors `oo team use`: the default is saved, but OO_TEAM_ID /
    // OO_TEAM_NAME keeps outranking it, so say so instead of letting the tip
    // above imply the new default is in effect.
    const envOverride = readTeamEnvOverride(context.env);

    if (selection.team !== undefined && envOverride !== undefined) {
        writeLine(
            context.stdout,
            context.translator.t("team.use.envOverrideHint", {
                envVar: teamEnvOverrideVariableName(envOverride),
            }),
        );
    }
}

// Picks the default team and persists it when it changes. Precedence:
// an explicit `--team` (must be a membership), then a still-valid configured
// `identity.team` (a re-login must not clobber a deliberate `oo team use`),
// then the backend-provisioned `system_created` team. A stale configured team
// is replaced rather than kept: after switching accounts the old name is not
// usable anyway.
async function resolveLoginTeamSelection(
    requestedTeam: string | undefined,
    teams: readonly TeamView[],
    context: CliExecutionContext,
): Promise<{ kind: LoginTeamSelection; team?: string }> {
    if (requestedTeam !== undefined) {
        if (!teams.some(team => team.name === requestedTeam)) {
            throw new CliUserError("errors.team.notAccessible", 1, {
                team: requestedTeam,
            });
        }

        await persistLoginTeamIdentity(requestedTeam, context);
        return { kind: "flag", team: requestedTeam };
    }

    const settings = await context.settingsStore.read();
    const configuredTeam = getConfiguredIdentityTeam(settings);

    if (
        configuredTeam !== undefined
        && teams.some(team => team.name === configuredTeam)
    ) {
        return { kind: "kept_config", team: configuredTeam };
    }

    const systemTeam = teams.find(team => team.systemCreated);

    if (systemTeam === undefined) {
        return { kind: "none" };
    }

    await persistLoginTeamIdentity(systemTeam.name, context);
    return { kind: "system_default", team: systemTeam.name };
}

async function persistLoginTeamIdentity(
    teamName: string,
    context: CliExecutionContext,
): Promise<void> {
    await context.settingsStore.update(settings =>
        setIdentityTeam(settings, teamName),
    );
    context.logger.info(
        { teamConfigured: true },
        "Default team identity persisted after login.",
    );
}

// Spells out at most `loginTeamHintLimit` team names and truncates the rest
// with an ellipsis so a large account does not flood the login output.
function formatLoginTeamNames(teams: readonly TeamView[]): string {
    const names = teams
        .slice(0, loginTeamHintLimit)
        .map(team => team.name);

    if (teams.length > loginTeamHintLimit) {
        names.push("…");
    }

    return names.join(", ");
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
