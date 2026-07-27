// The connector-specific edge of the team identity: how a resolved
// TeamIdentity travels on the wire, and how a connector target lends its
// credential to the resolution. The identity itself — the flag/env/config
// ladder and the validation policy — is owned by team/identity.ts.

import type { AuthAccount } from "../../schemas/auth.ts";
import type { TeamIdentity } from "../team/identity.ts";
import type { ConnectorTarget } from "./target.ts";

// Builds the identity request headers (`x-oo-team-name` / `x-oo-team-id`)
// from whichever dimensions the identity carries. Returns an empty object for
// the personal identity so callers can spread it unconditionally.
export function connectorIdentityHeaders(
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

// Bridges a connector target to the account shape the team identity lookups
// authenticate with. Undefined when the target carries no credential (a
// self-hosted server with authentication disabled), which downgrades an
// env-selected lookup to `no_credential`.
export function connectorTeamAccount(
    target: Pick<ConnectorTarget, "authorization" | "cacheEndpoint">,
): Pick<AuthAccount, "apiKey" | "endpoint"> | undefined {
    if (target.authorization === undefined) {
        return undefined;
    }

    return {
        apiKey: target.authorization,
        endpoint: target.cacheEndpoint,
    };
}
