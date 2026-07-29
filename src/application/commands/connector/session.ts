// The connector session: which connector server this invocation talks to, and
// under whose team identity — resolved once, behind one call. Handlers do
// their own pure input validation first, then everything identity-shaped
// happens here: the --team/--personal flag guards, target resolution, the
// self-hosted team rejection, the configured default, the team identity
// ladder with its execution gate, and the identity telemetry.
//
// The self-hosted runtime is single-user and has no team concept: an explicit
// --team is a hard error, while the account's default team or a team env
// override is silently ignored so a shared config does not break self-hosted
// usage. This module is the only place that rule exists.

import type { CliExecutionContext, CliOptionDefinition } from "../../contracts/cli.ts";
import type { TeamIdentity } from "../team/identity.ts";
import type { ConnectorTarget } from "./target.ts";

import { z } from "zod";
import { readDefaultTeam } from "../../auth/default-team.ts";
import { CliUserError } from "../../contracts/cli.ts";
import {
    requireValidTeamIdentity,
    resolveTeamIdentity,
} from "../team/identity.ts";
import { resolveConnectorTarget } from "./target.ts";

export interface ConnectorSession {
    // The effective team identity; undefined is the personal identity,
    // whether picked explicitly, by default, or pinned by a self-hosted
    // target.
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
 * Resolves the connector session from the raw `--team` / `--personal` input.
 *
 * Guards fire before any resolution: combining the two flags or passing a
 * blank `--team` is a usage error, and a self-hosted target rejects `--team`
 * outright. The team identity then resolves through the one ladder
 * (`--personal` > `--team` > `OO_TEAM_ID` > `OO_TEAM_NAME` > the account
 * default > personal) with the target's credential backing the env lookups, and
 * `requireValidTeamIdentity` gates execution on the outcome.
 *
 * `resolveAgainstBackend: false` (a dry run) keeps the resolution fully
 * offline. Records the `connector_kind` and `identity_source` telemetry
 * properties on success.
 */
export async function resolveConnectorSession(
    options: {
        personal?: boolean;
        team?: string;
        resolveAgainstBackend?: boolean;
    },
    context: ConnectorSessionContext,
): Promise<ConnectorSession> {
    if (options.personal === true && options.team !== undefined) {
        throw new CliUserError("errors.connectorRun.identityConflict", 2);
    }

    const teamFlag = options.team?.trim();

    if (options.team !== undefined && teamFlag === "") {
        throw new CliUserError("errors.connectorRun.teamEmpty", 2);
    }

    const target = await resolveConnectorTarget(context);

    if (target.kind === "self_hosted" && teamFlag !== undefined) {
        throw new CliUserError("errors.connector.teamUnsupported", 2);
    }

    const identity = target.kind === "self_hosted"
        ? undefined
        : requireValidTeamIdentity(
                await resolveTeamIdentity(
                    {
                        // The target lends its credential and account endpoint
                        // to the env-team lookups; only an OOMOL target has an
                        // account endpoint to lend.
                        account: {
                            apiKey: target.authorization,
                            endpoint: target.accountEndpoint,
                        },
                        defaultTeam: await readDefaultTeam(context),
                        teamFlag,
                        personalFlag: options.personal === true,
                        resolveAgainstBackend: options.resolveAgainstBackend !== false,
                    },
                    context,
                ),
                context,
            );

    context.telemetry?.recordProperties({
        connector_kind: target.kind,
        identity_source: identity?.source ?? "personal",
    });

    return { identity, target };
}

/**
 * The `--team` / `--personal` option pair every session-resolving command
 * declares. Flags and value names live here once; each command supplies its
 * own description keys so the help text keeps its verb.
 */
export function teamIdentityOptions(descriptionKeys: {
    personal: string;
    team: string;
}): readonly CliOptionDefinition[] {
    return [
        {
            name: "team",
            longFlag: "--team",
            valueName: "team",
            descriptionKey: descriptionKeys.team,
        },
        {
            name: "personal",
            longFlag: "--personal",
            descriptionKey: descriptionKeys.personal,
        },
    ];
}

// The input-schema counterpart of teamIdentityOptions, spread into each
// command's zod object so the field pair cannot drift across commands.
export const teamIdentityInputShape = {
    personal: z.boolean().optional(),
    team: z.string().optional(),
};
