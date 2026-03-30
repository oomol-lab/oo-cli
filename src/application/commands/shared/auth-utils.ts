import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { CliUserError } from "../../contracts/cli.ts";
import { readCurrentAuth } from "../auth/shared.ts";

export async function requireCurrentAccount(
    context: CliExecutionContext,
    authRequiredKey: string,
    accountMissingKey: string,
): Promise<AuthAccount> {
    const { authFile, currentAccount } = await readCurrentAuth(context);

    if (currentAccount !== undefined) {
        return currentAccount;
    }

    const errorKey = authFile.id === "" ? authRequiredKey : accountMissingKey;
    throw new CliUserError(errorKey, 1);
}
