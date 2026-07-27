import type { AuthFileState } from "../contracts/auth-store.ts";
import type {
    CliExecutionContext,
    CliTelemetryPropertyValue,
} from "../contracts/cli.ts";
import type { AuthAccount } from "../schemas/auth.ts";

import { writeAuthBlock } from "../commands/auth/shared.ts";
import { writeLine } from "../commands/shared/output.ts";
import { resolveSelfHostedConnectorTolerantly } from "../commands/shared/self-hosted-connector.ts";
import { CliUserError } from "../contracts/cli.ts";
import { getCurrentAuthAccount } from "../schemas/auth.ts";

// ---------------------------------------------------------------------------
// This module is the single owner of identity precedence: which credential
// authenticates an invocation, and against which endpoint. The full ordering
// is OO_API_KEY (with OO_ENDPOINT or the public default) over the auth.toml
// active account (with OO_ENDPOINT applied) over OO_ENDPOINT alone over the
// public default. Callers consume ResolvedIdentity instead of re-deriving any
// part of that chain.
// ---------------------------------------------------------------------------

// Public base endpoint used when nothing else is configured. Service URLs are
// derived by prefixing subdomains (api./llm./connector./search./...), so a
// single base value is enough to switch between environments.
const defaultOomolEndpoint = "oomol.com";

// Environment variables that let embedded callers drive execution commands
// without an interactive login or a persisted auth.toml.
const apiKeyEnvName = "OO_API_KEY";
const endpointEnvName = "OO_ENDPOINT";

// Synthetic identity for the in-memory account built from OO_API_KEY. It is
// never written to disk; the id/name only satisfy the auth account schema and
// surface in diagnostics. The id is stable so callers can recognize the env
// override (it has no real account scope, so e.g. publish must not derive a
// package name from it).
const envOverrideAccountId = "oo-env-override";
const envOverrideAccountName = "Environment (OO_API_KEY)";

const authErrorKeys = {
    activeAccountMissing: "auth.account.activeAccountMissing",
    required: "errors.auth.required",
    requiredConnectorOnly: "errors.auth.requiredConnectorOnly",
} as const;

export type IdentitySource = "env" | "file" | "none";

/**
 * The answer to "which credential authenticates this invocation, and against
 * which endpoint." `endpoint` is always usable, even when no account exists,
 * so unauthenticated reads share the same precedence as execution commands.
 * `fileState` reports what a tolerant auth-file read observed; it stays
 * "unread" when the env override short-circuits before any file access.
 */
export interface ResolvedIdentity {
    account: AuthAccount | undefined;
    endpoint: string;
    fileState: AuthFileState | "unread";
    overriddenBy?: "OO_API_KEY";
    source: IdentitySource;
}

/** A ResolvedIdentity that is guaranteed to carry a usable account. */
export interface RequiredIdentity extends ResolvedIdentity {
    account: AuthAccount;
    source: "env" | "file";
}

type ResolveIdentityContext = Pick<
    CliExecutionContext,
    "authStore" | "env" | "logger"
>;

type RequireIdentityContext = Pick<
    CliExecutionContext,
    "authStore" | "connectorStore" | "env" | "logger"
>;

/**
 * Resolves the identity tolerantly: every way of having no usable account —
 * no login, a stale active id, a missing or corrupt auth.toml — comes back as
 * `source: "none"` (with `fileState` saying why) instead of an error, and the
 * auth file is never created as a side effect. For commands whose own output
 * does not depend on the account, and for unauthenticated endpoint reads.
 */
export async function resolveIdentity(
    context: ResolveIdentityContext,
): Promise<ResolvedIdentity> {
    const envIdentity = resolveEnvIdentity(context.env);

    if (envIdentity !== undefined) {
        return envIdentity;
    }

    const { authFile, fileState } = await context.authStore.readTolerantState();
    const currentAccount = getCurrentAuthAccount(authFile);

    logResolvedAccount(context, authFile.auth.length, authFile.id, currentAccount);

    if (currentAccount !== undefined) {
        const account = applyEndpointOverride(currentAccount, context.env);

        return {
            account,
            endpoint: account.endpoint,
            fileState,
            source: "file",
        };
    }

    return {
        account: undefined,
        endpoint: readEndpointOverride(context.env) ?? defaultOomolEndpoint,
        fileState,
        source: "none",
    };
}

/**
 * Resolves the identity strictly, for commands that cannot proceed without a
 * credential: a corrupt auth.toml surfaces the store error instead of
 * misreporting "not logged in", and having no usable account throws the
 * auth-required error that explains what to do about it (including the
 * connector-only variant when only a self-hosted connector is configured).
 */
export async function requireIdentity(
    context: RequireIdentityContext,
): Promise<RequiredIdentity> {
    const envIdentity = resolveEnvIdentity(context.env);

    if (envIdentity !== undefined) {
        return envIdentity;
    }

    const authFile = await context.authStore.read();
    const currentAccount = getCurrentAuthAccount(authFile);

    logResolvedAccount(context, authFile.auth.length, authFile.id, currentAccount);

    if (currentAccount !== undefined) {
        const account = applyEndpointOverride(currentAccount, context.env);

        return {
            account,
            endpoint: account.endpoint,
            fileState: "ok",
            source: "file",
        };
    }

    if (authFile.id !== "") {
        throw new CliUserError(authErrorKeys.activeAccountMissing, 1);
    }

    // A user who only configured a self-hosted connector gets a dedicated
    // explanation: the self-hosted server covers connector commands only, and
    // everything else still needs an OOMOL account. The tolerant lookup keeps
    // a broken connector.toml from changing which auth error is shown.
    throw new CliUserError(
        await resolveSelfHostedConnectorTolerantly(context) !== undefined
            ? authErrorKeys.requiredConnectorOnly
            : authErrorKeys.required,
        1,
    );
}

/**
 * Resolves the endpoint the login flow authenticates against: OO_ENDPOINT or
 * the public default. The saved account's endpoint is deliberately not
 * consulted — logging in starts a new session and must not be steered by
 * where an old account points.
 */
export function resolveLoginEndpoint(
    env: Record<string, string | undefined>,
): string {
    return readEndpointOverride(env) ?? defaultOomolEndpoint;
}

/**
 * Standard report for a write command that an env override outranks: records
 * the credential-source telemetry, logs the no-op, renders the warning block,
 * and prints the unset hint. The summary wording stays per-command; only the
 * structure is owned here, so a new write command cannot forget a step.
 */
export function reportOverriddenWrite(
    context: CliExecutionContext,
    options: {
        extraTelemetry?: Record<string, CliTelemetryPropertyValue>;
        summaryKey: string;
    },
): void {
    context.telemetry?.recordProperties({
        credential_source: "env",
        ...options.extraTelemetry,
    });
    context.logger.info(
        { summaryKey: options.summaryKey },
        "Write command did nothing: OO_API_KEY provides the active credential.",
    );
    writeAuthBlock(context, {
        summary: context.translator.t(options.summaryKey),
        tone: "warning",
    });
    writeLine(
        context.stdout,
        context.translator.t("auth.envOverride.unsetHint"),
    );
}

// Shared by every env-override reader: a set-but-blank variable behaves
// exactly like an unset one.
export function readTrimmedEnv(
    env: Record<string, string | undefined>,
    name: string,
): string | undefined {
    const value = env[name]?.trim();

    return value === undefined || value === "" ? undefined : value;
}

// Returns the OO_ENDPOINT override when set to a non-empty value, otherwise
// undefined. OO_ENDPOINT is the only endpoint override across execution,
// login, and unauthenticated reads.
function readEndpointOverride(
    env: Record<string, string | undefined>,
): string | undefined {
    return readTrimmedEnv(env, endpointEnvName);
}

// Builds an in-memory account from OO_API_KEY (paired with OO_ENDPOINT, or the
// public default). Returns undefined when OO_API_KEY is absent so callers fall
// back to the persisted auth.toml. When defined, callers must NOT read or
// require auth.toml.
export function buildEnvApiKeyAccount(
    env: Record<string, string | undefined>,
): AuthAccount | undefined {
    const apiKey = readTrimmedEnv(env, apiKeyEnvName);

    if (apiKey === undefined) {
        return undefined;
    }

    return {
        apiKey,
        endpoint: readEndpointOverride(env) ?? defaultOomolEndpoint,
        id: envOverrideAccountId,
        name: envOverrideAccountName,
    };
}

// Applies the OO_ENDPOINT override to an account resolved from auth.toml so a
// bare OO_ENDPOINT (without OO_API_KEY) still redirects execution endpoints.
function applyEndpointOverride(
    account: AuthAccount,
    env: Record<string, string | undefined>,
): AuthAccount {
    const endpointOverride = readEndpointOverride(env);

    if (endpointOverride === undefined) {
        return account;
    }

    return {
        ...account,
        endpoint: endpointOverride,
    };
}

function resolveEnvIdentity(
    env: Record<string, string | undefined>,
): RequiredIdentity | undefined {
    const envAccount = buildEnvApiKeyAccount(env);

    if (envAccount === undefined) {
        return undefined;
    }

    return {
        account: envAccount,
        endpoint: envAccount.endpoint,
        fileState: "unread",
        overriddenBy: "OO_API_KEY",
        source: "env",
    };
}

function logResolvedAccount(
    context: Pick<CliExecutionContext, "logger">,
    accountCount: number,
    currentAuthId: string,
    currentAccount: AuthAccount | undefined,
): void {
    context.logger.debug(
        {
            accountCount,
            currentAuthId,
            hasCurrentAccount: currentAccount !== undefined,
        },
        currentAccount === undefined
            ? "Current auth account is not available."
            : "Current auth account resolved.",
    );
}
