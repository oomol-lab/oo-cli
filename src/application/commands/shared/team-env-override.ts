import { readTrimmedEnv } from "../../auth/identity.ts";

// Environment variables that let embedded and automated callers pin the team
// identity without touching the `identity.team` config default. OO_TEAM_ID
// carries the stable team id and is used as-is; OO_TEAM_NAME carries the team
// name and must be resolved to its id through the account's team memberships
// before execution.
export const teamIdEnvName = "OO_TEAM_ID";
export const teamNameEnvName = "OO_TEAM_NAME";

// The env-selected team, discriminated by which variable supplied it. An `id`
// override is complete; a `name` override still needs the membership lookup
// that maps the name to its team id.
export type TeamEnvOverride
    = | { kind: "id"; value: string }
        | { kind: "name"; value: string };

// Reads the team env override. OO_TEAM_ID outranks OO_TEAM_NAME when both are
// set because the id form is exact and needs no resolution request.
export function readTeamEnvOverride(
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
export function teamEnvOverrideVariableName(
    override: TeamEnvOverride,
): string {
    return override.kind === "id" ? teamIdEnvName : teamNameEnvName;
}
