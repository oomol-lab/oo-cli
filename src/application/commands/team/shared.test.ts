import type { Fetcher } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import { expectCliUserError, toRequest } from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { listMemberTeams } from "./shared.ts";

const testAccount = {
    apiKey: "api-secret-1",
    endpoint: "oomol.com",
};

describe("listMemberTeams", () => {
    test("requests the membership endpoint with the account api key and maps roles", async () => {
        const requests: Request[] = [];
        const teams = await listMemberTeams(
            testAccount,
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        teams: [
                            {
                                id: "team-1",
                                name: "acme",
                                avatar: "",
                                creator_user_id: "user-1",
                                role: "creator",
                            },
                            {
                                id: "team-2",
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
            "https://relation-control.oomol.com/v1/me/teams",
        );
        expect(requests[0]?.headers.get("authorization")).toBe("api-secret-1");
        expect(teams).toEqual([
            { id: "team-1", name: "acme", role: "creator" },
            { id: "team-2", name: "beta", role: "member" },
        ]);
    });

    test("treats an unknown or missing role as a plain membership", async () => {
        const teams = await listMemberTeams(
            testAccount,
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({
                    teams: [
                        { id: "team-1", name: "acme", role: "owner" },
                        { id: "team-2", name: "beta" },
                    ],
                })),
            }),
        );

        expect(teams).toEqual([
            { id: "team-1", name: "acme", role: "member" },
            { id: "team-2", name: "beta", role: "member" },
        ]);
    });

    test("returns an empty list when the account has no teams", async () => {
        const teams = await listMemberTeams(
            testAccount,
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({})),
            }),
        );

        expect(teams).toEqual([]);
    });

    test("rejects an unsupported response body", async () => {
        const error = await expectCliUserError(listMemberTeams(
            testAccount,
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({
                    teams: [{ name: "acme" }],
                })),
            }),
        ));

        expect(error.key).toBe("errors.team.invalidResponse");
    });

    test("surfaces a non-success status as a request-failed error", async () => {
        const error = await expectCliUserError(listMemberTeams(
            testAccount,
            createRequestContext({
                fetcher: async () => new Response("nope", { status: 500 }),
            }),
        ));

        expect(error.key).toBe("errors.team.requestFailed");
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
