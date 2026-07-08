import type { Fetcher } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import { expectCliUserError, toRequest } from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { listMemberOrganizations } from "./shared.ts";

const testAccount = {
    apiKey: "api-secret-1",
    endpoint: "oomol.com",
};

describe("listMemberOrganizations", () => {
    test("requests the membership endpoint with the account api key and maps roles", async () => {
        const requests: Request[] = [];
        const organizations = await listMemberOrganizations(
            testAccount,
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        organizations: [
                            {
                                id: "org-1",
                                name: "acme",
                                avatar: "",
                                creator_user_id: "user-1",
                                role: "creator",
                            },
                            {
                                id: "org-2",
                                name: "beta",
                                role: "member",
                            },
                        ],
                    }));
                },
            }),
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toBe(
            "https://org-control.oomol.com/v1/me/organizations",
        );
        expect(requests[0]?.headers.get("authorization")).toBe("api-secret-1");
        expect(organizations).toEqual([
            { id: "org-1", name: "acme", role: "creator" },
            { id: "org-2", name: "beta", role: "member" },
        ]);
    });

    test("treats an unknown or missing role as a plain membership", async () => {
        const organizations = await listMemberOrganizations(
            testAccount,
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({
                    organizations: [
                        { id: "org-1", name: "acme", role: "owner" },
                        { id: "org-2", name: "beta" },
                    ],
                })),
            }),
        );

        expect(organizations).toEqual([
            { id: "org-1", name: "acme", role: "member" },
            { id: "org-2", name: "beta", role: "member" },
        ]);
    });

    test("returns an empty list when the account has no organizations", async () => {
        const organizations = await listMemberOrganizations(
            testAccount,
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({})),
            }),
        );

        expect(organizations).toEqual([]);
    });

    test("rejects an unsupported response body", async () => {
        const error = await expectCliUserError(listMemberOrganizations(
            testAccount,
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({
                    organizations: [{ name: "acme" }],
                })),
            }),
        ));

        expect(error.key).toBe("errors.org.invalidResponse");
    });

    test("surfaces a non-success status as a request-failed error", async () => {
        const error = await expectCliUserError(listMemberOrganizations(
            testAccount,
            createRequestContext({
                fetcher: async () => new Response("nope", { status: 500 }),
            }),
        ));

        expect(error.key).toBe("errors.org.requestFailed");
    });
});

function createRequestContext(options: {
    fetcher: Fetcher;
}) {
    return {
        fetcher: options.fetcher,
        logger: pino({
            enabled: false,
        }),
        translator: createTranslator("en"),
    };
}
