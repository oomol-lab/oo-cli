import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { CliUserError } from "../../contracts/cli.ts";
import { readCurrentAuth } from "../auth/shared.ts";
import {
    applyEndpointOverride,
    buildEnvApiKeyAccount,
    defaultOomolEndpoint,
    readEndpointOverride,
} from "./auth-env-override.ts";

const authErrorKeys = {
    activeAccountMissing: "auth.account.activeAccountMissing",
    required: "errors.auth.required",
} as const;

export async function requireCurrentAccount(
    context: CliExecutionContext,
): Promise<AuthAccount> {
    // OO_API_KEY short-circuits before any auth.toml access so embedded callers
    // can run execution commands without a login or a persisted account.
    const envAccount = buildEnvApiKeyAccount(context.env);

    if (envAccount !== undefined) {
        return envAccount;
    }

    const { authFile, currentAccount } = await readCurrentAuth(context);

    if (currentAccount !== undefined) {
        // A bare OO_ENDPOINT (without OO_API_KEY) still redirects the execution
        // endpoint of the persisted account.
        return applyEndpointOverride(currentAccount, context.env);
    }

    const errorKey = authFile.id === ""
        ? authErrorKeys.required
        : authErrorKeys.activeAccountMissing;
    throw new CliUserError(errorKey, 1);
}

// Resolves the OOMOL endpoint without requiring a logged-in account. Prefers
// the OO_API_KEY/OO_ENDPOINT overrides, then the active account's endpoint (so
// non-default environments are honored), then the legacy OOMOL_ENDPOINT
// override, then the public default. Used by unauthenticated reads such as the
// skill-recommendation registry existence check.
export async function resolveCurrentEndpoint(
    context: CliExecutionContext,
): Promise<string> {
    const envAccount = buildEnvApiKeyAccount(context.env);

    if (envAccount !== undefined) {
        return envAccount.endpoint;
    }

    const endpointOverride = readEndpointOverride(context.env);

    if (endpointOverride !== undefined) {
        return endpointOverride;
    }

    const { currentAccount } = await readCurrentAuth(context);

    if (currentAccount !== undefined) {
        return currentAccount.endpoint;
    }

    return context.env.OOMOL_ENDPOINT?.trim() || defaultOomolEndpoint;
}
