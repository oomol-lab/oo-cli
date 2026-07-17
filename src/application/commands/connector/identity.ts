// Connector authentication identity.
//
// A connector run executes under exactly one identity:
//   personal => {}                 (no team)
//   team     => { team? , teamId? } (at least one dimension set)
//
// The identity is resolved once per connector invocation and then applied only
// to execution requests. The action schema / metadata layer is
// identity-independent and is intentionally left untouched.
//
// This struct is the extension point for additional identity dimensions: a new
// field here plus a branch in the request helpers below is all a future
// dimension needs.

import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { TeamEnvOverride } from "../shared/team-env-override.ts";
import type { ConnectorTarget } from "./target.ts";

import { CliUserError } from "../../contracts/cli.ts";
import { readTeamEnvOverride } from "../shared/team-env-override.ts";
import { listMemberTeams } from "../team/shared.ts";

export interface ConnectorIdentity {
    team?: string;
    teamId?: string;
}

// Where the resolved team came from. Recorded as privacy-safe telemetry; it
// never carries the team name or id itself.
type ConnectorIdentitySource
    = "config" | "env_id" | "env_name" | "flag" | "personal";

interface ResolvedConnectorIdentity {
    identity: ConnectorIdentity;
    source: ConnectorIdentitySource;
}

// Resolves the effective identity from the per-run flags, the env override,
// and the configured default. Precedence: --personal > --team > OO_TEAM_ID >
// OO_TEAM_NAME > config default > personal. A higher-priority identity fully
// replaces the lower ones (no field-level merge). An `env_name` result still
// carries only the name; `resolveConnectorIdentityWithEnv` fills in the id.
export function resolveConnectorIdentity(input: {
    configTeam: string | undefined;
    envOverride: TeamEnvOverride | undefined;
    teamFlag: string | undefined;
    personalFlag: boolean;
}): ResolvedConnectorIdentity {
    if (input.personalFlag) {
        return { identity: {}, source: "personal" };
    }

    if (input.teamFlag !== undefined && input.teamFlag !== "") {
        return {
            identity: { team: input.teamFlag },
            source: "flag",
        };
    }

    if (input.envOverride !== undefined) {
        return input.envOverride.kind === "id"
            ? {
                    identity: { teamId: input.envOverride.value },
                    source: "env_id",
                }
            : {
                    identity: { team: input.envOverride.value },
                    source: "env_name",
                };
    }

    if (input.configTeam !== undefined && input.configTeam !== "") {
        return {
            identity: { team: input.configTeam },
            source: "config",
        };
    }

    return { identity: {}, source: "personal" };
}

// Resolves the effective identity for an OOMOL connector target, including the
// env override. When OO_TEAM_NAME wins, the name is resolved to its team id
// through the account's membership listing so execution requests can carry the
// stable id; a name the account cannot access fails here, before any
// execution request is sent. Self-hosted targets never reach this function —
// they have no team concept, and callers pin the personal identity instead.
// `resolveEnvTeamId: false` skips the membership request and keeps the bare
// name identity — for validation-only invocations (`--dry-run`) that never
// send an execution request, so they stay offline like every other identity
// source.
export async function resolveConnectorIdentityWithEnv(
    options: {
        configTeam: string | undefined;
        resolveEnvTeamId?: boolean;
        target: Pick<ConnectorTarget, "authorization" | "cacheEndpoint">;
        teamFlag: string | undefined;
        personalFlag: boolean;
    },
    context: Pick<CliExecutionContext, "env" | "fetcher" | "logger" | "translator">,
): Promise<ResolvedConnectorIdentity> {
    const resolved = resolveConnectorIdentity({
        configTeam: options.configTeam,
        envOverride: readTeamEnvOverride(context.env),
        teamFlag: options.teamFlag,
        personalFlag: options.personalFlag,
    });

    if (
        resolved.source !== "env_name"
        || resolved.identity.team === undefined
        || options.resolveEnvTeamId === false
    ) {
        return resolved;
    }

    // OOMOL targets always carry the raw API key; the guard only narrows the
    // field, which stays optional for self-hosted servers.
    if (options.target.authorization === undefined) {
        throw new CliUserError("errors.auth.required", 1);
    }

    const teams = await listMemberTeams(
        {
            apiKey: options.target.authorization,
            endpoint: options.target.cacheEndpoint,
        },
        context,
    );
    const teamName = resolved.identity.team;
    const match = teams.find(team => team.name === teamName);

    if (match === undefined) {
        throw new CliUserError("errors.team.envNameNotAccessible", 1, {
            team: teamName,
        });
    }

    return {
        identity: { team: match.name, teamId: match.id },
        source: "env_name",
    };
}

// Builds the identity request headers (`x-oo-team-name` / `x-oo-team-id`).
// Returns an empty object for the personal identity so callers can spread it
// unconditionally.
export function connectorIdentityHeaders(
    identity: ConnectorIdentity | undefined,
): Record<string, string> {
    const headers: Record<string, string> = {};

    if (identity?.team !== undefined) {
        headers["x-oo-team-name"] = identity.team;
    }

    if (identity?.teamId !== undefined) {
        headers["x-oo-team-id"] = identity.teamId;
    }

    return headers;
}
