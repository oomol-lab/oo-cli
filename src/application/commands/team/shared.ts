import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import { probeOo, requestOo } from "../shared/oo-request.ts";

// One team the current account belongs to. The membership listing always
// carries `role` (exactly `creator` or `member`; any other value is treated as
// a plain membership) and `system_created`, which marks the team the backend
// provisions for every account (at most one at a time, and it cannot be
// deleted). Both fields are always present in the response, so both are
// required — a missing one is a malformed response, not a defaulted value.
const teamResponseItemSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    role: z.string(),
    system_created: z.boolean(),
});

// `GET /v1/me/teams` wraps the memberships in a `teams` array. The array is
// optional/defaulted so an account with no teams parses
// cleanly instead of failing validation.
const teamsResponseSchema = z.object({
    teams: z.array(teamResponseItemSchema).optional().default([]),
});

export type TeamRole = "creator" | "member";

export interface TeamView {
    id: string;
    name: string;
    role: TeamRole;
    systemCreated: boolean;
}

// Lists every team the account can authenticate as. Backed by
// `GET https://relation-control.{endpoint}/v1/me/teams`, which returns the full
// membership set (teams the account created appear here too, with
// `role: "creator"`), so a single request answers "which values are valid for
// `--team`". The account API key authenticates through the gateway; no team
// identity header is involved.
export async function listMemberTeams(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<TeamView[]> {
    const parsed = await requestOo({
        authorization: account.apiKey,
        context,
        errors: { scope: "team" },
        host: { endpoint: account.endpoint, service: "relation-control" },
        label: "Team list",
        path: "/v1/me/teams",
        schema: teamsResponseSchema,
    });

    return parsed.teams.map(toTeamView);
}

// How a team-id lookup ended. Only `valid` carries a team; every other value
// explains why the name stays unknown, and the distinction is the whole point:
// "this id is not a team you belong to" and "the lookup could not run" call for
// different fixes, and collapsing them into one "unknown" sends the reader down
// the wrong path.
export type TeamLookupStatus
    = | "valid"
        | "not_a_member"
        | "not_found"
        | "deleted"
        | TeamLookupFailureStatus;

// The two ways a lookup ends without the backend having answered: the shared
// half of every lookup result type.
type TeamLookupFailureStatus = "request_failed" | "request_failed_sandbox";

export type TeamLookupResult
    = | { status: "valid"; team: TeamView }
        | { status: Exclude<TeamLookupStatus, "valid"> };

// The three statuses the backend distinguishes for a member-gated team read.
// Anything else — including 401 from a rejected key — is a failed lookup rather
// than a statement about the team.
const teamLookupStatusByHttpStatus: Record<number, Exclude<TeamLookupStatus, "valid">> = {
    403: "not_a_member",
    404: "not_found",
    410: "deleted",
};

// Resolves one team id to its team. Backed by
// `GET https://relation-control.{endpoint}/v1/teams/{teamId}`, the singular form
// of `/v1/me/teams`, so the response is a single membership entry and parses
// with the same schema.
//
// This never throws: callers are diagnostic commands that must still report the
// rest of their output when the lookup fails, so every failure comes back as a
// status instead of an error.
export async function fetchTeamById(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    teamId: string,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<TeamLookupResult> {
    return lookupTeam(
        account,
        "id",
        `/v1/teams/${encodeURIComponent(teamId)}`,
        (bodyText, status) => {
            if (status !== 200) {
                return {
                    status: teamLookupStatusByHttpStatus[status] ?? "request_failed",
                };
            }

            return {
                status: "valid",
                team: toTeamView(
                    teamResponseItemSchema.parse(parseLookupBody(bodyText)),
                ),
            };
        },
        context,
    );
}

// Resolves one team name to its team through the account's membership listing —
// the name-direction counterpart of fetchTeamById, with the same never-throw
// contract. A name that is not among the memberships comes back as
// `not_a_member`: the listing cannot tell "no such team" from "not yours", and
// only the backend could.
export async function fetchTeamByName(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    teamName: string,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<TeamLookupResult> {
    return lookupTeam(
        account,
        "name",
        "/v1/me/teams",
        (bodyText, status) => {
            if (status !== 200) {
                return { status: "request_failed" };
            }

            const teams = teamsResponseSchema
                .parse(parseLookupBody(bodyText))
                .teams
                .map(toTeamView);
            const match = teams.find(team => team.name === teamName);

            return match === undefined
                ? { status: "not_a_member" }
                : { status: "valid", team: match };
        },
        context,
    );
}

// `GET /v1/me/default-team` answers with a bare team object (no `role`) and
// `404` when the account has created no team. Only the identity is read: the
// callers persist or act for the team by id and name.
const defaultTeamResponseSchema = teamResponseItemSchema.pick({ id: true, name: true });

// How the default-team lookup ended. `none` is a definite backend answer —
// the account has created no team, so a request without a team selection runs
// as personal — and is the one outcome callers act on differently from a
// lookup that could not run.
export type DefaultTeamLookupResult
    = | { status: "valid"; team: Pick<TeamView, "id" | "name"> }
        | { status: "none" | TeamLookupFailureStatus };

// Resolves the team the gateway applies to a request that carries no team
// selection. Backed by
// `GET https://relation-control.{endpoint}/v1/me/default-team`, which
// evaluates the same rule the gateway consults, so the CLI never has to
// reconstruct that rule from the membership listing (where a naive "first
// `system_created` team" pick can land on a team someone else created).
//
// Same never-throw contract as the other lookups: every failure is a status.
export async function fetchDefaultTeam(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<DefaultTeamLookupResult> {
    return lookupTeam(
        account,
        "default",
        "/v1/me/default-team",
        (bodyText, status) => {
            if (status === 404) {
                return { status: "none" };
            }

            if (status !== 200) {
                return { status: "request_failed" };
            }

            return {
                status: "valid",
                team: defaultTeamResponseSchema.parse(parseLookupBody(bodyText)),
            };
        },
        context,
    );
}

// Shared interpretation skeleton of the team lookups, on top of the probe
// seam. Any failure the interpreter does not classify — non-JSON bodies,
// schema mismatches, an unreadable body — comes back as a request-failed
// status instead of an error, which is what keeps the lookups' never-throw
// contract honest.
async function lookupTeam<T extends { status: string }>(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    direction: "default" | "id" | "name",
    path: string,
    interpret: (bodyText: string | undefined, status: number) => T,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
): Promise<T | { status: TeamLookupFailureStatus }> {
    const probe = await probeOo({
        authorization: account.apiKey,
        context,
        host: { endpoint: account.endpoint, service: "relation-control" },
        label: "Team lookup",
        logFields: { direction, endpoint: account.endpoint },
        path,
    });

    if (probe.kind !== "response") {
        return {
            status: probe.kind === "failed_sandbox"
                ? "request_failed_sandbox"
                : "request_failed",
        };
    }

    try {
        return interpret(probe.bodyText, probe.status);
    }
    catch (error) {
        context.logger.warn(
            { direction, endpoint: account.endpoint, err: error },
            "Team lookup request failed unexpectedly.",
        );

        return { status: "request_failed" };
    }
}

// An unreadable body parses as no JSON at all, so both lookups classify it
// through their interpreter's failure path.
function parseLookupBody(bodyText: string | undefined): unknown {
    return JSON.parse(bodyText ?? "") as unknown;
}

function toTeamView(
    item: z.output<typeof teamResponseItemSchema>,
): TeamView {
    return {
        id: item.id,
        name: item.name,
        role: item.role === "creator" ? "creator" : "member",
        systemCreated: item.system_created,
    };
}
