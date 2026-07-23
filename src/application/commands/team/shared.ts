import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import {
    getUnexpectedRequestErrorMessage,
    isNetworkRestrictedSandboxError,
    requestText,
} from "../shared/request.ts";

export const teamFormatValues = ["json"] as const;

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
// optional/defaulted so an empty account (personal identity only) parses
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
    const requestUrl = new URL(
        `https://relation-control.${account.endpoint}/v1/me/teams`,
    );

    const rawResponse = await requestText({
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.team.requestFailed",
            1,
            { status },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.team.requestError",
            1,
            { message: getUnexpectedRequestErrorMessage(error, context.translator) },
        ),
        init: {
            headers: {
                Authorization: account.apiKey,
            },
        },
        requestLabel: "Team list",
        requestUrl,
    });

    try {
        return teamsResponseSchema
            .parse(JSON.parse(rawResponse) as unknown)
            .teams
            .map(toTeamView);
    }
    catch {
        throw new CliUserError("errors.team.invalidResponse", 1);
    }
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
        | "request_failed"
        | "request_failed_sandbox";

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
    const requestUrl = new URL(
        `https://relation-control.${account.endpoint}/v1/teams/${encodeURIComponent(teamId)}`,
    );
    const requestStartedAt = Date.now();

    context.logger.debug(
        { endpoint: account.endpoint },
        "Team lookup request started.",
    );

    try {
        const response = await context.fetcher(requestUrl, {
            headers: {
                Authorization: account.apiKey,
            },
        });

        context.logger.debug(
            {
                durationMs: Date.now() - requestStartedAt,
                endpoint: account.endpoint,
                status: response.status,
            },
            "Team lookup request completed.",
        );

        if (response.status !== 200) {
            return {
                status: teamLookupStatusByHttpStatus[response.status]
                    ?? "request_failed",
            };
        }

        return {
            status: "valid",
            team: toTeamView(
                teamResponseItemSchema.parse(await response.json() as unknown),
            ),
        };
    }
    catch (error) {
        context.logger.warn(
            {
                durationMs: Date.now() - requestStartedAt,
                endpoint: account.endpoint,
                err: error,
            },
            "Team lookup request failed unexpectedly.",
        );

        return {
            status: isNetworkRestrictedSandboxError(error)
                ? "request_failed_sandbox"
                : "request_failed",
        };
    }
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
