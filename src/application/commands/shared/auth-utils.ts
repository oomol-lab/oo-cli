import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { CliUserError } from "../../contracts/cli.ts";
import { readCurrentAuth } from "../auth/shared.ts";

const authErrorKeys = {
    activeAccountMissing: "auth.account.activeAccountMissing",
    required: "errors.auth.required",
} as const;

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
