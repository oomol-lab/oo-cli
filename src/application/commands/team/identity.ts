// The team identity: which team an invocation acts for, and whether that team
// is real.
//
// Three modules used to each encode the "--team > OO_TEAM_ID > OO_TEAM_NAME >
// the account default" ladder and validate only the direction they happened
// to resolve, which is how `oo auth status` could vouch for an identity
// `oo connector run` rejected — and vice versa. Every team-aware command now
// resolves through this module, so the ladder, the validation policy, and the
// source vocabulary have exactly one owner.
//
// `undefined` is the absence of a team identity, not a fifth kind of team: no
// team header is sent and the gateway applies the account's server-side
// default team. It is never a private, per-user scope.

import type { AccountDefaultTeam } from "../../auth/default-team.ts";
import type { CliExecutionContext, CliOptionDefinition } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import type { TeamLookupStatus } from "./shared.ts";
import { z } from "zod";
import { readDefaultTeam } from "../../auth/default-team.ts";
import { readTrimmedEnv } from "../../auth/identity.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { fetchDefaultTeam, fetchTeamById, fetchTeamByName } from "./shared.ts";

// Which mechanism selects the identity. `flag` is a per-run `--team`; `env_id`
// and `env_name` name the variable that won; `account` is the default team
// saved on the active account; `backend_default` is the server-side default
// team the backend reported because nothing local selected one. Recorded as
// privacy-safe telemetry; it never carries the team name or id itself.
export type TeamIdentitySource
    = "account" | "backend_default" | "env_id" | "env_name" | "flag";

// `no_credential` is the one status the backend cannot produce: it means the
// lookup never ran because no account was available to authenticate it.
export type TeamNameStatus = TeamLookupStatus | "no_credential";

export interface TeamIdentity {
    name: string | null;
    id: string | null;
    source: TeamIdentitySource;
    // How the backend lookup ended; `null` when no lookup was attempted. A
    // flag is the gateway's to judge and stays `null` on every path; an
    // env-selected identity is always looked up; a saved default is looked up
    // only for callers that need its current name (`resolveCurrentName`).
    status: TeamNameStatus | null;
    // The env variable supplying the override, for user-facing hints; absent
    // for the flag and account sources.
    envVar?: string;
}

type ResolveTeamIdentityContext = Pick<
    CliExecutionContext,
    "env" | "fetcher" | "logger"
>;

/**
 * Resolves the team identity from the per-run flags, the env override, the
 * account default, and the backend's own default — one ladder for every
 * team-aware command:
 * `--team` > OO_TEAM_ID > OO_TEAM_NAME > the account default > the
 * server-side default team > none (undefined). A higher tier fully replaces
 * the lower ones, and a trimmed-empty flag or stored name counts as unset.
 *
 * With `resolveAgainstBackend: true`, an env-selected identity is completed
 * and validated through the lookup matching its direction (id-to-name via the
 * team route, name-to-id via the memberships), so both env variables get the
 * same one validation policy. The outcome lands in `status` — never an error,
 * so reporting commands can keep reporting; execution paths gate on it via
 * requireValidTeamIdentity. `account` may be undefined (reads must work
 * without a login), which downgrades the lookup to `no_credential`.
 *
 * With `resolveCurrentName: true` as well, the caller needs the team's
 * current name — a Workbench deep link, a report of which team is in effect
 * — and spends one request to get it. A saved default is refreshed through
 * its id, because the stored name is only the name the team had when it was
 * saved and goes stale on rename; a name-only default (migrated from the
 * legacy setting) is completed through the memberships instead; and with
 * nothing saved the backend is asked for the server-side default team it
 * applies to a header-less request. Execution paths that only send headers
 * leave it off: the gateway resolves by id and applies the same default
 * itself, so the lookup would buy them nothing and cost every run a request
 * (retried on failure) against a service they do not otherwise depend on.
 * The server-default lookup can only add an identity: with no answer (no
 * team created, or a failed request) the resolver returns undefined and the
 * gateway keeps applying its default.
 *
 * With `resolveAgainstBackend: false` (`--dry-run`, offline reporting), the
 * resolution is fully offline and `status` stays null.
 */
export async function resolveTeamIdentity(
    input: ResolveTeamIdentityInput,
    context: ResolveTeamIdentityContext,
): Promise<TeamIdentity | undefined> {
    const teamFlag = normalizeTeamValue(input.teamFlag);

    if (teamFlag !== undefined) {
        return { name: teamFlag, id: null, source: "flag", status: null };
    }

    const envOverride = readTeamEnvOverride(context.env);

    if (envOverride !== undefined) {
        return resolveEnvTeamIdentity(envOverride, input, context);
    }

    const defaultTeamName = normalizeTeamValue(input.defaultTeam?.name);
    const account = currentNameCredential(input);

    if (defaultTeamName !== undefined) {
        const stored: TeamIdentity = {
            name: defaultTeamName,
            // The stored id, when the default was saved by a command that had
            // the membership listing in hand. A default migrated from the
            // legacy global setting carries the name alone.
            id: input.defaultTeam?.id ?? null,
            source: "account",
            status: null,
        };

        return account === undefined
            ? stored
            : refreshAccountTeamIdentity(stored, account, context);
    }

    return account === undefined
        ? undefined
        : resolveBackendDefaultTeamIdentity(account, context);
}

interface ResolveTeamIdentityInput {
    account: Pick<AuthAccount, "apiKey" | "endpoint"> | undefined;
    defaultTeam: AccountDefaultTeam | undefined;
    teamFlag?: string;
    resolveAgainstBackend: boolean;
    resolveCurrentName?: boolean;
}

// The credential the current-name lookups run with, or undefined when the
// caller did not ask for the name, the resolution is offline, or no account
// can authenticate a lookup — all three mean "report what is stored".
function currentNameCredential(
    input: ResolveTeamIdentityInput,
): Pick<AuthAccount, "apiKey" | "endpoint"> | undefined {
    return input.resolveAgainstBackend && input.resolveCurrentName === true
        ? input.account
        : undefined;
}

// Brings a saved default up to date. The id is the stable key, so the name
// comes back current even after a rename, and a team that is gone or no
// longer accessible surfaces as a status instead of a stale name that the
// gateway or the console would reject. A name-only default has no id to
// refresh by, so it is completed through the memberships, which also answers
// whether that name still belongs to the account.
async function refreshAccountTeamIdentity(
    stored: TeamIdentity,
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: ResolveTeamIdentityContext,
): Promise<TeamIdentity> {
    const lookup = stored.id === null
        ? await fetchTeamByName(account, stored.name ?? "", context)
        : await fetchTeamById(account, stored.id, context);

    if (lookup.status !== "valid") {
        return { ...stored, status: lookup.status };
    }

    return {
        ...stored,
        name: lookup.team.name,
        id: lookup.team.id,
        status: "valid",
    };
}

// The bottom tier. Never persisted here — saving a default stays with
// `oo login` and `oo team use`, so a read-only command does not write the
// auth file and an `OO_API_KEY` identity (which has nowhere to persist) still
// resolves.
async function resolveBackendDefaultTeamIdentity(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: ResolveTeamIdentityContext,
): Promise<TeamIdentity | undefined> {
    const lookup = await fetchDefaultTeam(account, context);

    if (lookup.status === "valid") {
        return {
            name: lookup.team.name,
            id: lookup.team.id,
            source: "backend_default",
            status: "valid",
        };
    }

    if (lookup.status !== "none") {
        context.logger.warn(
            { status: lookup.status },
            "Default team lookup could not complete; proceeding without a team selection.",
        );
    }

    return undefined;
}

const teamNameStatusTranslationKeys = {
    deleted: "team.identity.status.deleted",
    no_credential: "team.identity.status.noCredential",
    not_a_member: "team.identity.status.notAMember",
    not_found: "team.identity.status.notFound",
    request_failed: "team.identity.status.requestFailed",
    request_failed_sandbox: "team.identity.status.requestFailedSandbox",
} as const satisfies Record<Exclude<TeamNameStatus, "valid">, string>;

/**
 * The execution-path gate on a resolved identity. A definite backend refusal
 * (not a member, not found, deleted) and a lookup that never had a credential
 * block the run with the error that explains the fix; a lookup the backend
 * could not answer passes through, because the gateway sees every execution
 * request anyway and stays the final judge — the CLI must not turn its own
 * connectivity problem into a verdict about the team.
 */
export function requireValidTeamIdentity(
    identity: TeamIdentity | undefined,
    context: Pick<CliExecutionContext, "logger" | "translator">,
): TeamIdentity | undefined {
    if (
        identity === undefined
        || identity.status === null
        || identity.status === "valid"
    ) {
        return identity;
    }

    switch (identity.status) {
        case "no_credential":
            throw new CliUserError("errors.auth.required", 1);
        case "deleted":
        case "not_a_member":
        case "not_found":
            if (identity.source === "env_name") {
                throw new CliUserError("errors.team.envNameNotAccessible", 1, {
                    team: identity.name ?? "",
                });
            }

            // A saved default that the refresh could not confirm: the fix is
            // to pick another team or log in again, not to edit a variable.
            if (identity.source === "account") {
                throw new CliUserError("errors.team.accountDefaultNotAccessible", 1, {
                    reason: context.translator.t(
                        teamNameStatusTranslationKeys[identity.status],
                    ),
                    team: identity.name ?? identity.id ?? "",
                });
            }

            throw new CliUserError("errors.team.envIdNotAccessible", 1, {
                reason: context.translator.t(
                    teamNameStatusTranslationKeys[identity.status],
                ),
                teamId: identity.id ?? "",
            });
        case "request_failed":
        case "request_failed_sandbox":
            context.logger.warn(
                { source: identity.source, status: identity.status },
                "Team identity validation could not complete; proceeding so the gateway can judge.",
            );

            return identity;
    }
}

// Telemetry uses a closed enum, so the "nothing was attempted" cases collapse
// to a single value instead of a missing property.
export function teamNameStatusForTelemetry(
    identity: TeamIdentity | undefined,
): TeamNameStatus | "none" {
    return identity?.status ?? "none";
}

// The identity-source telemetry enum: the mechanism that selected the team,
// or `none` when nothing did and the server-side default team applies.
export function teamSourceForTelemetry(
    identity: TeamIdentity | undefined,
): TeamIdentitySource | "none" {
    return identity?.source ?? "none";
}

type ResolveAccountTeamIdentityContext = Pick<
    CliExecutionContext,
    | "authStore"
    | "env"
    | "fetcher"
    | "logger"
    | "settingsStore"
    | "telemetry"
    | "translator"
>;

/**
 * The one pipeline every team-aware command runs before acting for a team:
 * the `--team` guard, the account's saved default, the shared ladder, the
 * execution gate, and the `identity_source` telemetry property. `account` is
 * the credential backing any env-team lookup.
 *
 * `undefined` means no team header is sent, which lets the gateway apply the
 * server-side default team; it is not a private, per-user scope. These
 * commands only send headers, so they leave the server-default lookup off.
 *
 * `resolveAgainstBackend: false` (`--dry-run`) keeps the resolution fully
 * offline.
 */
export async function resolveAccountTeamIdentity(
    input: { team?: string },
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: ResolveAccountTeamIdentityContext,
    options: { resolveAgainstBackend?: boolean } = {},
): Promise<TeamIdentity | undefined> {
    const identity = requireValidTeamIdentity(
        await resolveTeamIdentity(
            {
                account,
                defaultTeam: await readDefaultTeam(context),
                teamFlag: readTeamFlag(input),
                resolveAgainstBackend: options.resolveAgainstBackend !== false,
            },
            context,
        ),
        context,
    );

    context.telemetry?.recordProperties({
        identity_source: teamSourceForTelemetry(identity),
    });

    return identity;
}

// Builds the standard team identity headers for OOMOL service requests.
export function teamIdentityHeaders(
    identity: TeamIdentity | undefined,
): Record<string, string> {
    const headers: Record<string, string> = {};

    if (identity === undefined) {
        return headers;
    }

    if (identity.name !== null) {
        headers["x-oo-team-name"] = identity.name;
    }

    if (identity.id !== null) {
        headers["x-oo-team-id"] = identity.id;
    }

    return headers;
}

/**
 * The usage guard on `--team`, shared by every team-aware command so the same
 * input cannot be a usage error in one command and accepted in another: a
 * `--team` that was passed but is blank is a typo, not an unset flag.
 *
 * Returns the trimmed `--team` value, ready for the ladder — `undefined` when
 * the flag was not passed, and never the empty string.
 */
export function readTeamFlag(input: { team?: string }): string | undefined {
    const teamFlag = input.team?.trim();

    if (input.team !== undefined && teamFlag === "") {
        throw new CliUserError("errors.team.teamEmpty", 2);
    }

    return teamFlag;
}

/**
 * The `--team` option every team-aware command declares. The flag and value
 * name live here once; each command supplies its own description key so the
 * help text keeps its verb.
 */
export function teamOption(descriptionKey: string): CliOptionDefinition {
    return {
        name: "team",
        longFlag: "--team",
        valueName: "team",
        descriptionKey,
    };
}

// The input-schema counterpart of teamIdentityOptions, spread into each
// command's zod object so the field cannot drift across commands.
export const teamIdentityInputShape = {
    team: z.string().optional(),
};

// Renders the identity for humans: the name with its id in parentheses when
// both are known, otherwise whichever one is.
export function formatTeamIdentityValue(
    identity: TeamIdentity,
    translator: Pick<CliExecutionContext["translator"], "t">,
): string {
    return identity.name !== null && identity.id !== null
        ? translator.t("team.identity.nameWithId", {
                name: identity.name,
                teamId: identity.id,
            })
        : identity.name ?? identity.id ?? "";
}

// Appends why a lookup failed, because a bare value with no explanation is
// exactly the output this whole feature exists to remove — the reader cannot
// tell a wrong team from an unreachable backend.
//
// This takes the finished line rather than the raw value so the reason always
// lands last. Each caller wraps the value in its own phrasing ("(via
// OO_TEAM_ID)", a full sentence), and folding the reason in earlier would bury
// it mid-line.
export function appendTeamIdentityStatus(
    line: string,
    identity: TeamIdentity,
    translator: Pick<CliExecutionContext["translator"], "t">,
): string {
    if (identity.status === null || identity.status === "valid") {
        return line;
    }

    return translator.t("team.identity.statusSuffix", {
        reason: translator.t(teamNameStatusTranslationKeys[identity.status]),
        value: line,
    });
}

// Completes and validates an env-selected identity in the direction the
// override supplies: an id is missing its name, a name is missing its id.
// Both directions share one policy — the same statuses, the same downgrade to
// `no_credential` without an account, the same offline short-circuit.
async function resolveEnvTeamIdentity(
    envOverride: TeamEnvOverride,
    input: {
        account: Pick<AuthAccount, "apiKey" | "endpoint"> | undefined;
        resolveAgainstBackend: boolean;
    },
    context: ResolveTeamIdentityContext,
): Promise<TeamIdentity> {
    const bare: TeamIdentity = envOverride.kind === "id"
        ? {
                name: null,
                id: envOverride.value,
                source: "env_id",
                status: null,
                envVar: teamEnvOverrideVariableName(envOverride),
            }
        : {
                name: envOverride.value,
                id: null,
                source: "env_name",
                status: null,
                envVar: teamEnvOverrideVariableName(envOverride),
            };

    if (!input.resolveAgainstBackend) {
        return bare;
    }

    if (input.account === undefined) {
        return { ...bare, status: "no_credential" };
    }

    const lookup = envOverride.kind === "id"
        ? await fetchTeamById(input.account, envOverride.value, context)
        : await fetchTeamByName(input.account, envOverride.value, context);

    if (lookup.status !== "valid") {
        return { ...bare, status: lookup.status };
    }

    return {
        ...bare,
        name: lookup.team.name,
        id: lookup.team.id,
        status: "valid",
    };
}

// One empty-value policy for the flag and account tiers: a trimmed-empty team
// name behaves exactly like an unset one, matching how the env readers treat
// blank variables.
function normalizeTeamValue(value: string | undefined): string | undefined {
    const trimmed = value?.trim();

    return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

// ---------------------------------------------------------------------------
// The env override tier. OO_TEAM_ID carries the stable team id, OO_TEAM_NAME
// the team name, for embedded and automated callers that pin the team without
// touching the account default. Private to the resolver: which
// variable won, and what it means, surfaces only through the TeamIdentity
// record (`source`, `envVar`).
// ---------------------------------------------------------------------------

const teamIdEnvName = "OO_TEAM_ID";
const teamNameEnvName = "OO_TEAM_NAME";

// The env-selected team, discriminated by which variable supplied it. An `id`
// override still needs the name direction of the lookup, a `name` override the
// id direction.
type TeamEnvOverride
    = | { kind: "id"; value: string }
        | { kind: "name"; value: string };

// Reads the team env override. OO_TEAM_ID outranks OO_TEAM_NAME when both are
// set because the id form is exact.
function readTeamEnvOverride(
    env: Record<string, string | undefined>,
): TeamEnvOverride | undefined {
    const teamId = readTrimmedEnv(env, teamIdEnvName);

    if (teamId !== undefined) {
        return { kind: "id", value: teamId };
    }

    const teamName = readTrimmedEnv(env, teamNameEnvName);

    if (teamName !== undefined) {
        return { kind: "name", value: teamName };
    }

    return undefined;
}

// Names the env variable that supplies the override, for user-facing hints
// ("unset {envVar} ..."). Kept next to the reader so messages never drift from
// the actual precedence.
function teamEnvOverrideVariableName(
    override: TeamEnvOverride,
): string {
    return override.kind === "id" ? teamIdEnvName : teamNameEnvName;
}
