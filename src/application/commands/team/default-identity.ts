// The default team identity: which team commands run as when no per-run
// `--team` / `--personal` flag is given.
//
// Two commands report it — `oo auth status` and `oo team current` — and they
// used to derive it separately, which is how they drifted apart. Both now go
// through this module so "what is my default team, and is that identity real"
// has exactly one answer.

import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import type { TeamLookupStatus } from "./shared.ts";
import {
    readTeamEnvOverride,
    teamEnvOverrideVariableName,
} from "../shared/team-env-override.ts";
import { fetchTeamById } from "./shared.ts";

// Which mechanism selects the identity. `env_id` and `env_name` name the
// variable that won; `config` is the persisted `identity.team` default.
export type TeamIdentitySource = "config" | "env_id" | "env_name";

// `no_credential` is the one status the backend cannot produce: it means the
// lookup never ran because no account was available to authenticate it.
export type TeamNameStatus = TeamLookupStatus | "no_credential";

export interface DefaultTeamIdentity {
    name: string | null;
    id: string | null;
    source: TeamIdentitySource;
    // `null` when no lookup was attempted. `config` and `env_name` already
    // carry the name, so there is nothing to resolve and no request is sent —
    // only an id-shaped identity costs a round-trip.
    status: TeamNameStatus | null;
    // The env variable supplying the override, for user-facing hints; absent
    // for the config source.
    envVar?: string;
}

// Resolves the default team identity, filling in the name when only an id is
// known. Precedence matches every other team-aware command: OO_TEAM_ID >
// OO_TEAM_NAME > the `identity.team` config default > personal (undefined).
//
// `account` is optional because `oo team current` must keep working without a
// login: a missing account downgrades the lookup to `no_credential` rather than
// failing the command.
export async function resolveDefaultTeamIdentity(
    input: {
        account: Pick<AuthAccount, "apiKey" | "endpoint"> | undefined;
        configuredTeam: string | undefined;
    },
    context: Pick<CliExecutionContext, "env" | "fetcher" | "logger">,
): Promise<DefaultTeamIdentity | undefined> {
    const envOverride = readTeamEnvOverride(context.env);

    if (envOverride === undefined) {
        return input.configuredTeam === undefined
            ? undefined
            : {
                    name: input.configuredTeam,
                    id: null,
                    source: "config",
                    status: null,
                };
    }

    const envVar = teamEnvOverrideVariableName(envOverride);

    if (envOverride.kind === "name") {
        return {
            name: envOverride.value,
            id: null,
            source: "env_name",
            status: null,
            envVar,
        };
    }

    const lookup = input.account === undefined
        ? { status: "no_credential" as const }
        : await fetchTeamById(input.account, envOverride.value, context);

    return {
        name: lookup.status === "valid" ? lookup.team.name : null,
        id: envOverride.value,
        source: "env_id",
        status: lookup.status,
        envVar,
    };
}

// Telemetry uses a closed enum, so the "nothing was attempted" cases collapse
// to a single value instead of a missing property.
export function teamNameStatusForTelemetry(
    identity: DefaultTeamIdentity | undefined,
): TeamNameStatus | "none" {
    return identity?.status ?? "none";
}

const teamNameStatusTranslationKeys = {
    deleted: "team.identity.status.deleted",
    no_credential: "team.identity.status.noCredential",
    not_a_member: "team.identity.status.notAMember",
    not_found: "team.identity.status.notFound",
    request_failed: "team.identity.status.requestFailed",
    request_failed_sandbox: "team.identity.status.requestFailedSandbox",
} as const satisfies Record<Exclude<TeamNameStatus, "valid">, string>;

// Renders the identity for humans: the name with its id in parentheses when
// both are known, otherwise whichever one is.
export function formatTeamIdentityValue(
    identity: DefaultTeamIdentity,
    translator: Pick<CliExecutionContext["translator"], "t">,
): string {
    return identity.name !== null && identity.id !== null
        ? translator.t("team.identity.nameWithId", {
                name: identity.name,
                teamId: identity.id,
            })
        : identity.name ?? identity.id ?? "";
}

// Appends why a lookup failed, because a bare id with no explanation is exactly
// the output this whole feature exists to remove — the reader cannot tell a
// wrong id from an unreachable backend.
//
// This takes the finished line rather than the raw value so the reason always
// lands last. Each caller wraps the value in its own phrasing ("(via
// OO_TEAM_ID)", a full sentence), and folding the reason in earlier would bury
// it mid-line.
export function appendTeamIdentityStatus(
    line: string,
    identity: DefaultTeamIdentity,
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
