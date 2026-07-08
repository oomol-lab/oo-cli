import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import {
    getUnexpectedRequestErrorMessage,
    requestText,
} from "../shared/request.ts";

export const orgFormatValues = ["json"] as const;

// One organization the current account belongs to. The backend membership
// listing carries a role of exactly `creator` or `member`; anything else is
// treated as a plain membership.
const organizationResponseItemSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    role: z.string().optional(),
});

// `GET /v1/me/organizations` wraps the memberships in an `organizations` array.
// The array is optional/defaulted so an empty account (personal identity only)
// parses cleanly instead of failing validation.
const organizationsResponseSchema = z.object({
    organizations: z.array(organizationResponseItemSchema).optional().default([]),
});

export type OrganizationRole = "creator" | "member";

export interface OrganizationView {
    id: string;
    name: string;
    role: OrganizationRole;
}

// Lists every organization the account can authenticate as. Backed by
// `GET https://org-control.{endpoint}/v1/me/organizations`, which returns the
// full membership set (organizations the account created appear here too, with
// `role: "creator"`), so a single request answers "which values are valid for
// `--org`". The account API key authenticates through the gateway; no
// organization identity header is involved.
export async function listMemberOrganizations(
    account: Pick<AuthAccount, "apiKey" | "endpoint">,
    context: Pick<CliExecutionContext, "fetcher" | "logger" | "translator">,
): Promise<OrganizationView[]> {
    const requestUrl = new URL(
        `https://org-control.${account.endpoint}/v1/me/organizations`,
    );

    const rawResponse = await requestText({
        context,
        createRequestFailedError: status => new CliUserError(
            "errors.org.requestFailed",
            1,
            { status },
        ),
        createUnexpectedError: error => new CliUserError(
            "errors.org.requestError",
            1,
            { message: getUnexpectedRequestErrorMessage(error, context.translator) },
        ),
        init: {
            headers: {
                Authorization: account.apiKey,
            },
        },
        requestLabel: "Organization list",
        requestUrl,
    });

    try {
        return organizationsResponseSchema
            .parse(JSON.parse(rawResponse) as unknown)
            .organizations
            .map(toOrganizationView);
    }
    catch {
        throw new CliUserError("errors.org.invalidResponse", 1);
    }
}

function toOrganizationView(
    item: z.output<typeof organizationResponseItemSchema>,
): OrganizationView {
    return {
        id: item.id,
        name: item.name,
        role: item.role === "creator" ? "creator" : "member",
    };
}
