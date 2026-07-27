// The team identity: which team an invocation acts for, and whether that team
// is real.
//
// Three modules used to each encode the "--personal > --team > OO_TEAM_ID >
// OO_TEAM_NAME > identity.team > personal" ladder and validate only the
// direction they happened to resolve, which is how `oo auth status` could
// vouch for an identity `oo connector run` rejected — and vice versa. Every
// team-aware command now resolves through this module, so the ladder, the
// validation policy, and the source vocabulary have exactly one owner.
//
// Personal is the absence of a team identity, not a fifth kind of team:
// resolveTeamIdentity returns undefined for it, whether it was picked
// explicitly (`--personal`) or by nothing else selecting a team.

import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { TeamEnvOverride } from "../shared/team-env-override.ts";

import type { TeamLookupStatus } from "./shared.ts";
import { CliUserError } from "../../contracts/cli.ts";
import {
    readTeamEnvOverride,
    teamEnvOverrideVariableName,
} from "../shared/team-env-override.ts";
import { fetchTeamById, fetchTeamByName } from "./shared.ts";

// Which mechanism selects the identity. `flag` is a per-run `--team`; `env_id`
// and `env_name` name the variable that won; `config` is the persisted
// `identity.team` default. Recorded as privacy-safe telemetry; it never
// carries the team name or id itself.
export type TeamIdentitySource = "config" | "env_id" | "env_name" | "flag";

// `no_credential` is the one status the backend cannot produce: it means the
// lookup never ran because no account was available to authenticate it.
export type TeamNameStatus = TeamLookupStatus | "no_credential";

export interface TeamIdentity {
    name: string | null;
    id: string | null;
    source: TeamIdentitySource;
    // How the backend lookup ended; `null` when no lookup was attempted.
    // Only env-selected identities are ever looked up — a flag or config name
    // is the gateway's to judge, so those stay `null` on every path.
    status: TeamNameStatus | null;
    // The env variable supplying the override, for user-facing hints; absent
    // for the flag and config sources.
    envVar?: string;
}

type ResolveTeamIdentityContext = Pick<
    CliExecutionContext,
    "env" | "fetcher" | "logger"
>;

/**
 * Resolves the team identity from the per-run flags, the env override, and
 * the configured default — one ladder for every team-aware command:
 * `--personal` > `--team` > OO_TEAM_ID > OO_TEAM_NAME > `identity.team` >
 * personal (undefined). A higher tier fully replaces the lower ones, and a
 * trimmed-empty flag or config value counts as unset.
 *
 * With `resolveAgainstBackend: true`, an env-selected identity is completed
 * and validated through the lookup matching its direction (id-to-name via the
 * team route, name-to-id via the memberships), so both env variables get the
 * same one validation policy. The outcome lands in `status` — never an error,
 * so reporting commands can keep reporting; execution paths gate on it via
 * requireValidTeamIdentity. `account` may be undefined (reads must work
 * without a login), which downgrades the lookup to `no_credential`.
 *
 * With `resolveAgainstBackend: false` (`--dry-run`, offline reporting), the
 * resolution is fully offline and `status` stays null.
 */
export async function resolveTeamIdentity(
    input: {
        account: Pick<AuthAccount, "apiKey" | "endpoint"> | undefined;
        configuredTeam: string | undefined;
        teamFlag?: string;
        personalFlag?: boolean;
        resolveAgainstBackend: boolean;
    },
    context: ResolveTeamIdentityContext,
): Promise<TeamIdentity | undefined> {
    if (input.personalFlag === true) {
        return undefined;
    }

    const teamFlag = normalizeTeamValue(input.teamFlag);

    if (teamFlag !== undefined) {
        return { name: teamFlag, id: null, source: "flag", status: null };
    }

    const envOverride = readTeamEnvOverride(context.env);

    if (envOverride !== undefined) {
        return resolveEnvTeamIdentity(envOverride, input, context);
    }

    const configuredTeam = normalizeTeamValue(input.configuredTeam);

    if (configuredTeam !== undefined) {
        return { name: configuredTeam, id: null, source: "config", status: null };
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
 *
 * The connector commands migrate onto this gate in the next stacked PR; the
 * tag below only bridges knip until that lands.
 *
 * @public
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

// One empty-value policy for the flag and config tiers: a trimmed-empty team
// name behaves exactly like an unset one, matching how the env readers treat
// blank variables.
function normalizeTeamValue(value: string | undefined): string | undefined {
    const trimmed = value?.trim();

    return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}
