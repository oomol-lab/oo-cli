// ---------------------------------------------------------------------------
// The account default team: which team the active account acts for when no
// per-run flag and no env override says otherwise.
//
// A default team belongs to an account, not to the installation — membership
// is per account, so a single global setting inevitably lends one account's
// team to another. This module is the only owner of that answer: where it is
// stored, how a pre-account installation's value is migrated, and the one
// rule that OO_API_KEY has no persisted default at all.
//
// The compatibility layer here — the legacy read, the migration, and the
// settings-file passthrough that keeps an unmigrated value alive — is
// temporary. It comes out once the `team_default_migrated` telemetry property
// stops appearing, and the three parts go together.
// ---------------------------------------------------------------------------

import type { CliExecutionContext } from "../contracts/cli.ts";
import type { AppSettings } from "../schemas/settings.ts";

import {
    getCurrentAuthAccount,
    setAccountDefaultTeam,
} from "../schemas/auth.ts";
import {
    getLegacyIdentityTeam,
    unsetLegacyIdentityTeam,
} from "../schemas/settings.ts";
import { buildEnvApiKeyAccount } from "./identity.ts";

/**
 * The persisted default team of the active account. `id` is null for a
 * default that only ever had a name — one migrated from the legacy global
 * setting, until a command that holds the membership listing backfills it.
 */
export interface AccountDefaultTeam {
    id: string | null;
    name: string;
}

type ReadDefaultTeamContext = Pick<
    CliExecutionContext,
    "authStore" | "env" | "settingsStore"
>;

type WriteDefaultTeamContext = Pick<
    CliExecutionContext,
    "authStore" | "settingsStore" | "telemetry"
>;

type MigrateDefaultTeamContext = Pick<
    CliExecutionContext,
    "authStore" | "env" | "logger" | "settingsStore" | "telemetry"
>;

/**
 * Reads the default team in effect for the active account, or undefined when
 * none is saved (team-aware commands then send no team header and the gateway
 * applies the server-side default team).
 *
 * With OO_API_KEY set there is no persisted default at all: the credential
 * may belong to an entirely different account, and lending it a saved
 * account's team is exactly the mix-up account scoping exists to prevent.
 * Automated callers pin a team with OO_TEAM_ID / OO_TEAM_NAME instead.
 *
 * The legacy global setting is still consulted when the active account has no
 * default of its own, so an installation whose migration could not complete —
 * an unreadable auth.toml, no saved account — keeps resolving the team it
 * always did. This read never writes; the migration owns that.
 */
export async function readDefaultTeam(
    context: ReadDefaultTeamContext,
): Promise<AccountDefaultTeam | undefined> {
    if (buildEnvApiKeyAccount(context.env) !== undefined) {
        return undefined;
    }

    // Tolerant: resolving a default team must never create auth.toml, and a
    // corrupt one must fall through to the legacy value rather than fail a
    // command whose own output does not depend on the saved accounts.
    const { authFile } = await context.authStore.readTolerantState();
    const account = getCurrentAuthAccount(authFile);

    if (account?.team !== undefined) {
        return { id: account.teamId ?? null, name: account.team };
    }

    const legacyTeam = getLegacyIdentityTeam(await context.settingsStore.read());

    return legacyTeam === undefined ? undefined : { id: null, name: legacyTeam };
}

/**
 * Records the default team on the active account. Returns false when no saved
 * account can hold it, which is how a caller learns its write would have been
 * silently dropped.
 *
 * Deliberately does not check for an OO_API_KEY override: `oo auth login`
 * saves an account even while that variable outranks it, and the default team
 * of the account it just saved belongs with it. Callers whose own write would
 * be pointless under the override (`oo team use`) check for it themselves and
 * report an overridden write.
 */
export async function writeDefaultTeam(
    context: WriteDefaultTeamContext,
    team: AccountDefaultTeam,
): Promise<boolean> {
    const authFile = await context.authStore.read();
    const account = getCurrentAuthAccount(authFile);

    if (account === undefined) {
        return false;
    }

    // Re-selecting the team already stored, and the id backfill on an account
    // whose id is already there, both land here; neither is worth a file
    // rewrite.
    if (
        account.team !== team.name
        || (account.teamId ?? null) !== team.id
    ) {
        await context.authStore.write(
            setAccountDefaultTeam(authFile, account.id, team),
        );
    }

    await dropLegacyIdentityTeam(context);

    return true;
}

/**
 * Moves the legacy global default team onto the active account, then deletes
 * it. Runs once per invocation before any command, so the value is gone
 * before anything can read it from the old place — no command needs to know
 * the legacy setting exists.
 *
 * Best effort by construction: it runs ahead of every command, including ones
 * with nothing to do with identity, so no failure here may change what a
 * command does or which exit code it returns. Having no account to migrate
 * onto is not a failure — the value stays put and `readDefaultTeam` keeps
 * honouring it until an account exists.
 */
export async function migrateLegacyDefaultTeam(
    context: MigrateDefaultTeamContext,
    settings: AppSettings,
): Promise<void> {
    if (buildEnvApiKeyAccount(context.env) !== undefined) {
        return;
    }

    try {
        // The caller's own settings read answers "is there anything to move",
        // so the overwhelmingly common case — no legacy value — costs nothing
        // beyond this check, and the bootstrap needs to know nothing about the
        // legacy setting itself.
        const legacyTeam = getLegacyIdentityTeam(settings);

        if (legacyTeam === undefined) {
            return;
        }

        const { authFile } = await context.authStore.readTolerantState();
        const account = getCurrentAuthAccount(authFile);

        if (account === undefined) {
            return;
        }

        // An account that already chose a default keeps it; only the stale
        // legacy value goes. This is also what makes a half-finished
        // migration self-healing on the next run.
        if (account.team === undefined) {
            await context.authStore.write(
                setAccountDefaultTeam(authFile, account.id, {
                    id: null,
                    name: legacyTeam,
                }),
            );
        }

        await dropLegacyIdentityTeam(context);

        context.logger.info(
            { teamDefaultMigrated: true },
            "Legacy default team identity migrated into the active account.",
        );
    }
    catch (error) {
        context.logger.warn(
            { err: error },
            "Legacy default team identity migration did not complete; the legacy setting is left in place.",
        );
    }
}

// Deletes the legacy setting, skipping the file write when there is nothing
// to delete. Returns whether a value was removed.
//
// This is the single point where a legacy value stops existing, so it is also
// where the removal is reported: the telemetry property means "this
// invocation found and consumed a legacy value", whether the bootstrap
// migration, `oo team use`, or `oo team clear` was the one to reach it. Any
// path that deleted the value without recording it would make the property
// under-report, and under-reporting is what decides when the compatibility
// layer is safe to delete.
async function dropLegacyIdentityTeam(
    context: Pick<CliExecutionContext, "settingsStore" | "telemetry">,
): Promise<boolean> {
    const settings = await context.settingsStore.read();

    if (getLegacyIdentityTeam(settings) === undefined) {
        return false;
    }

    await context.settingsStore.update(unsetLegacyIdentityTeam);
    context.telemetry?.recordProperties({ team_default_migrated: true });

    return true;
}
