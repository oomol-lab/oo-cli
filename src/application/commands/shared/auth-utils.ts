import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { CliUserError } from "../../contracts/cli.ts";
import { readCurrentAuth } from "../auth/shared.ts";

const authErrorKeys = {
    activeAccountMissing: "auth.account.activeAccountMissing",
    required: "errors.auth.required",
} as const;

const defaultOomolEndpoint = "oomol.com";

export async function requireCurrentAccount(
    context: CliExecutionContext,
): Promise<AuthAccount> {
    const { authFile, currentAccount } = await readCurrentAuth(context);

    if (currentAccount !== undefined) {
        return currentAccount;
    }

    const errorKey = authFile.id === ""
        ? authErrorKeys.required
        : authErrorKeys.activeAccountMissing;
    throw new CliUserError(errorKey, 1);
}

// Resolves the OOMOL endpoint without requiring a logged-in account. Prefers
// the active account's endpoint (so non-default environments are honored), then
// the OOMOL_ENDPOINT override, then the public default. Used by unauthenticated
// reads such as the skill-recommendation registry existence check.
export async function resolveCurrentEndpoint(
    context: CliExecutionContext,
): Promise<string> {
    const { currentAccount } = await readCurrentAuth(context);

    if (currentAccount !== undefined) {
        return currentAccount.endpoint;
    }

    return context.env.OOMOL_ENDPOINT?.trim() || defaultOomolEndpoint;
}
