// Connector authentication identity.
//
// A connector run executes under exactly one identity:
//   personal => {}               (no organization)
//   org      => { organization }
//
// The identity is resolved once per connector invocation and then applied only
// to execution requests. The action schema / metadata layer is
// identity-independent and is intentionally left untouched.
//
// This struct is the extension point for additional identity dimensions: a new
// field here plus a branch in the request helpers below is all a future
// dimension needs.
export interface ConnectorIdentity {
    organization?: string;
}

// Where the resolved organization came from. Recorded as privacy-safe telemetry;
// it never carries the organization or team name itself.
type ConnectorIdentitySource = "config" | "flag" | "personal";

interface ResolvedConnectorIdentity {
    identity: ConnectorIdentity;
    source: ConnectorIdentitySource;
}

// Resolves the effective identity from the per-run flags and the configured
// default. Precedence: --personal > --organization > config default > personal.
// A flag identity fully replaces the configured default (no field-level merge).
export function resolveConnectorIdentity(input: {
    configOrganization: string | undefined;
    organizationFlag: string | undefined;
    personalFlag: boolean;
}): ResolvedConnectorIdentity {
    if (input.personalFlag) {
        return { identity: {}, source: "personal" };
    }

    if (input.organizationFlag !== undefined && input.organizationFlag !== "") {
        return {
            identity: { organization: input.organizationFlag },
            source: "flag",
        };
    }

    if (input.configOrganization !== undefined && input.configOrganization !== "") {
        return {
            identity: { organization: input.configOrganization },
            source: "config",
        };
    }

    return { identity: {}, source: "personal" };
}

// Builds the identity request headers (`x-oo-organization-name`). Returns an
// empty object for the personal identity so callers can spread it unconditionally.
export function connectorIdentityHeaders(
    identity: ConnectorIdentity | undefined,
): Record<string, string> {
    const headers: Record<string, string> = {};

    if (identity?.organization !== undefined) {
        headers["x-oo-organization-name"] = identity.organization;
    }

    return headers;
}
