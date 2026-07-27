import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { requireIdentity, resolveIdentity } from "../../auth/identity.ts";

// Thin compatibility shells: identity precedence lives in the deep identity
// module. Call requireIdentity/resolveIdentity directly for new code; this
// file is deleted once every caller has migrated.

export async function requireCurrentAccount(
    context: CliExecutionContext,
): Promise<AuthAccount> {
    return (await requireIdentity(context)).account;
}

export async function resolveCurrentAccountTolerantly(
    context: CliExecutionContext,
): Promise<AuthAccount | undefined> {
    return (await resolveIdentity(context)).account;
}

export async function resolveCurrentEndpoint(
    context: CliExecutionContext,
): Promise<string> {
    return (await resolveIdentity(context)).endpoint;
}
