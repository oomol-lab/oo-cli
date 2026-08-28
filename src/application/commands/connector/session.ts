// The connector session: which connector server this invocation talks to, and
// under whose team identity — resolved once, behind one call. Handlers do
// their own pure input validation first, then everything identity-shaped
// happens here: the shared --team flag guard, target resolution,
// the self-hosted team rejection, the configured default, the team identity
// ladder with its execution gate, and the identity telemetry.
//
// The self-hosted runtime is single-user and has no team concept: an explicit
// --team is a hard error, while the account's default team or a team env
// override is silently ignored so a shared config does not break self-hosted
// usage. This module is the only place that rule exists.

import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { TeamIdentity } from "../team/identity.ts";
import type { ConnectorTarget } from "./target.ts";

import { CliUserError } from "../../contracts/cli.ts";
import {
    readTeamFlag,
    resolveAccountTeamIdentity,
    teamSourceForTelemetry,
} from "../team/identity.ts";
import { resolveConnectorTarget } from "./target.ts";

export interface ConnectorSession {
    // The effective team identity; undefined sends no team header (the
    // gateway applies the server-side default team), whether because nothing
    // selected a team or because a self-hosted target has no team concept.
    identity: TeamIdentity | undefined;
    target: ConnectorTarget;
}

export type ConnectorSessionContext = Pick<
    CliExecutionContext,
    | "authStore"
    | "connectorStore"
    | "env"
    | "fetcher"
    | "logger"
    | "settingsStore"
    | "telemetry"
    | "translator"
>;

/**
 * Resolves the connector session from the raw `--team` input.
 *
 * Guards fire before any resolution: a blank `--team` is a usage error, and a
 * self-hosted target rejects `--team` outright. The team identity then
 * resolves through the one ladder (`--team` > `OO_TEAM_ID` > `OO_TEAM_NAME` >
 * the account default) with the target's credential backing the env lookups,
 * and `requireValidTeamIdentity` gates execution on the outcome.
 *
 * `resolveAgainstBackend: false` (a dry run) keeps the resolution fully
 * offline. Records the `connector_kind` and `identity_source` telemetry
 * properties on success.
 */
export async function resolveConnectorSession(
    options: {
        team?: string;
        resolveAgainstBackend?: boolean;
    },
    context: ConnectorSessionContext,
): Promise<ConnectorSession> {
    // The guard runs before the target resolves so a blank `--team` is a
    // usage error even when no login is configured.
    const teamFlag = readTeamFlag(options);

    const target = await resolveConnectorTarget(context);

    if (target.kind === "self_hosted") {
        if (teamFlag !== undefined) {
            throw new CliUserError("errors.connector.teamUnsupported", 2);
        }

        context.telemetry?.recordProperties({
            connector_kind: target.kind,
            identity_source: teamSourceForTelemetry(undefined),
        });

        return { identity: undefined, target };
    }

    context.telemetry?.recordProperties({ connector_kind: target.kind });

    // The target lends its credential and account endpoint to the env-team
    // lookups; only an OOMOL target has an account endpoint to lend.
    const identity = await resolveAccountTeamIdentity(
        options,
        { apiKey: target.authorization, endpoint: target.accountEndpoint },
        context,
        { resolveAgainstBackend: options.resolveAgainstBackend },
    );

    return { identity, target };
}
