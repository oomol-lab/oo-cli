// Connector authentication identity.
//
// A connector run executes under exactly one identity:
//   personal => {}       (no team)
//   team     => { team }
//
// The identity is resolved once per connector invocation and then applied only
// to execution requests. The action schema / metadata layer is
// identity-independent and is intentionally left untouched.
//
// This struct is the extension point for additional identity dimensions: a new
// field here plus a branch in the request helpers below is all a future
// dimension needs.
export interface ConnectorIdentity {
    team?: string;
}

// Where the resolved team came from. Recorded as privacy-safe telemetry; it
// never carries the team name itself.
type ConnectorIdentitySource = "config" | "flag" | "personal";

interface ResolvedConnectorIdentity {
    identity: ConnectorIdentity;
    source: ConnectorIdentitySource;
}

// Resolves the effective identity from the per-run flags and the configured
// default. Precedence: --personal > --team > config default > personal.
// A flag identity fully replaces the configured default (no field-level merge).
export function resolveConnectorIdentity(input: {
    configTeam: string | undefined;
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

    if (input.configTeam !== undefined && input.configTeam !== "") {
        return {
            identity: { team: input.configTeam },
            source: "config",
        };
    }

    return { identity: {}, source: "personal" };
}

// Builds the identity request headers (`x-oo-team-name`). Returns an empty
// object for the personal identity so callers can spread it unconditionally.
export function connectorIdentityHeaders(
    identity: ConnectorIdentity | undefined,
): Record<string, string> {
    const headers: Record<string, string> = {};

    if (identity?.team !== undefined) {
        headers["x-oo-team-name"] = identity.team;
    }

    return headers;
}
