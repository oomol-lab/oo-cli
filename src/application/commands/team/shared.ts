import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import {
    getUnexpectedRequestErrorMessage,
    requestText,
} from "../shared/request.ts";

export const teamFormatValues = ["json"] as const;

// One team the current account belongs to. The backend membership listing
// carries a role of exactly `creator` or `member`; anything else is treated as
// a plain membership.
const teamResponseItemSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    role: z.string().optional(),
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

function toTeamView(
    item: z.output<typeof teamResponseItemSchema>,
): TeamView {
    return {
        id: item.id,
        name: item.name,
        role: item.role === "creator" ? "creator" : "member",
    };
}
