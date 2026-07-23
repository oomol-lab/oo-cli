import type { Fetcher } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createFailedToOpenSocketError,
    expectCliUserError,
    toRequest,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { fetchTeamById, listMemberTeams } from "./shared.ts";

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
                                system_created: false,
                            },
                            {
                                id: "team-2",
                                name: "beta",
                                role: "member",
                                system_created: false,
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
            { id: "team-1", name: "acme", role: "creator", systemCreated: false },
            { id: "team-2", name: "beta", role: "member", systemCreated: false },
        ]);
    });

    test("maps the system_created marker onto the team view", async () => {
        const teams = await listMemberTeams(
            testAccount,
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({
                    teams: [
                        {
                            id: "team-1",
                            name: "acme",
                            role: "creator",
                            system_created: true,
                        },
                        {
                            id: "team-2",
                            name: "beta",
                            role: "member",
                            system_created: false,
                        },
                    ],
                })),
            }),
        );

        expect(teams).toEqual([
            { id: "team-1", name: "acme", role: "creator", systemCreated: true },
            { id: "team-2", name: "beta", role: "member", systemCreated: false },
        ]);
    });

    test("treats an unrecognized role as a plain membership", async () => {
        const teams = await listMemberTeams(
            testAccount,
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({
                    teams: [
                        { id: "team-1", name: "acme", role: "owner", system_created: false },
                        { id: "team-2", name: "beta", role: "guest", system_created: false },
                    ],
                })),
            }),
        );

        expect(teams).toEqual([
            { id: "team-1", name: "acme", role: "member", systemCreated: false },
            { id: "team-2", name: "beta", role: "member", systemCreated: false },
        ]);
    });

    test("rejects a team item missing the required role or system_created field", async () => {
        const missingRole = await expectCliUserError(listMemberTeams(
            testAccount,
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({
                    teams: [{ id: "team-1", name: "acme", system_created: false }],
                })),
            }),
        ));
        expect(missingRole.key).toBe("errors.team.invalidResponse");

        const missingSystemCreated = await expectCliUserError(listMemberTeams(
            testAccount,
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({
                    teams: [{ id: "team-1", name: "acme", role: "creator" }],
                })),
            }),
        ));
        expect(missingSystemCreated.key).toBe("errors.team.invalidResponse");
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

describe("fetchTeamById", () => {
    test("requests the singular team route and maps the membership entry", async () => {
        const requests: Request[] = [];
        const result = await fetchTeamById(
            testAccount,
            "team-1",
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        id: "team-1",
                        name: "acme",
                        avatar: "",
                        creator_user_id: "user-1",
                        role: "creator",
                        system_created: true,
                    }));
                },
            }),
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toBe(
            "https://relation-control.oomol.com/v1/teams/team-1",
        );
        expect(requests[0]?.headers.get("authorization")).toBe("api-secret-1");
        expect(result).toEqual({
            status: "valid",
            team: {
                id: "team-1",
                name: "acme",
                role: "creator",
                systemCreated: true,
            },
        });
    });

    test("percent-encodes the team id so a hostile value cannot reshape the path", async () => {
        const requests: Request[] = [];
        await fetchTeamById(
            testAccount,
            "../me/teams",
            createRequestContext({
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response("{}", { status: 404 });
                },
            }),
        );

        expect(requests[0]?.url).toBe(
            "https://relation-control.oomol.com/v1/teams/..%2Fme%2Fteams",
        );
    });

    // Each backend answer means a different fix for the caller, so they must
    // stay distinguishable rather than collapse into one failure.
    test.each([
        { httpStatus: 403, status: "not_a_member" },
        { httpStatus: 404, status: "not_found" },
        { httpStatus: 410, status: "deleted" },
        { httpStatus: 401, status: "request_failed" },
        { httpStatus: 500, status: "request_failed" },
    ])("maps HTTP $httpStatus to $status", async ({ httpStatus, status }) => {
        const result = await fetchTeamById(
            testAccount,
            "team-1",
            createRequestContext({
                fetcher: async () => new Response("{}", { status: httpStatus }),
            }),
        );

        expect(result).toEqual({ status });
    });

    test("reports a sandbox-blocked request separately from a plain failure", async () => {
        const result = await fetchTeamById(
            testAccount,
            "team-1",
            createRequestContext({
                fetcher: async () => {
                    throw createFailedToOpenSocketError("network is restricted");
                },
            }),
        );

        expect(result).toEqual({ status: "request_failed_sandbox" });
    });

    test("treats a malformed success body as a failed lookup rather than throwing", async () => {
        const result = await fetchTeamById(
            testAccount,
            "team-1",
            createRequestContext({
                fetcher: async () => new Response(JSON.stringify({ id: "team-1" })),
            }),
        );

        expect(result).toEqual({ status: "request_failed" });
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
