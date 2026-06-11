import type { AuthAccount } from "../../schemas/auth.ts";

// Public base endpoint used when nothing else is configured. Service URLs are
// derived by prefixing subdomains (api./llm./connector./search./...), so a
// single base value is enough to switch between environments.
export const defaultOomolEndpoint = "oomol.com";

// Environment variables that let embedded callers drive execution commands
// without an interactive login or a persisted auth.toml.
const apiKeyEnvName = "OO_API_KEY";
const endpointEnvName = "OO_ENDPOINT";

// Synthetic identity for the in-memory account built from OO_API_KEY. It is
// never written to disk; the id/name only satisfy the auth account schema and
// surface in diagnostics. The id is stable so callers can recognize the env
// override (it has no real account scope, so e.g. publish must not derive a
// package name from it).
export const envOverrideAccountId = "oo-env-override";
const envOverrideAccountName = "Environment (OO_API_KEY)";

function readTrimmedEnv(
    env: Record<string, string | undefined>,
    name: string,
): string | undefined {
    const value = env[name]?.trim();
    return value === undefined || value === "" ? undefined : value;
}

// Returns the OO_ENDPOINT override when set to a non-empty value, otherwise
// undefined. OO_ENDPOINT only affects the new override path; the legacy
// OOMOL_ENDPOINT keeps its historical login/unauthenticated-read behavior.
export function readEndpointOverride(
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

// True when the account is the in-memory identity built from OO_API_KEY rather
// than a persisted account. Such an account has no real scope/username, so
// scope-deriving callers (e.g. skill publish) must require explicit input.
export function isEnvOverrideAccount(
    account: Pick<AuthAccount, "id">,
): boolean {
    return account.id === envOverrideAccountId;
}

// Applies the OO_ENDPOINT override to an account resolved from auth.toml so a
// bare OO_ENDPOINT (without OO_API_KEY) still redirects execution endpoints.
export function applyEndpointOverride(
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
