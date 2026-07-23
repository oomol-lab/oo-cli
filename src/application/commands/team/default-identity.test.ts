import type { Fetcher } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import { toRequest } from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import {
    appendTeamIdentityStatus,
    formatTeamIdentityValue,
    resolveDefaultTeamIdentity,
    teamNameStatusForTelemetry,
} from "./default-identity.ts";

const testAccount = {
    apiKey: "api-secret-1",
    endpoint: "oomol.com",
};

describe("resolveDefaultTeamIdentity", () => {
    test("reports no identity when neither the env nor the config selects a team", async () => {
        expect(await resolveDefaultTeamIdentity(
            { account: testAccount, configuredTeam: undefined },
            createContext({}),
        )).toBeUndefined();
    });

    // Only an id-shaped identity is missing its name, so it is the only source
    // that may cost a request.
    test.each([
        {
            case: "config default",
            env: {},
            configuredTeam: "acme",
            expected: { name: "acme", id: null, source: "config", status: null },
        },
        {
            case: "OO_TEAM_NAME override",
            env: { OO_TEAM_NAME: "beta" },
            configuredTeam: "acme",
            expected: {
                name: "beta",
                id: null,
                source: "env_name",
                status: null,
                envVar: "OO_TEAM_NAME",
            },
        },
    ])("resolves the $case offline", async ({ configuredTeam, env, expected }) => {
        let requested = false;

        expect(await resolveDefaultTeamIdentity(
            { account: testAccount, configuredTeam },
            createContext(env, async () => {
                requested = true;

                return new Response("{}", { status: 200 });
            }),
        )).toEqual(expected);
        expect(requested).toBe(false);
    });

    test("resolves an OO_TEAM_ID override to its team name", async () => {
        const requests: Request[] = [];
        const identity = await resolveDefaultTeamIdentity(
            { account: testAccount, configuredTeam: "acme" },
            createContext(
                { OO_TEAM_ID: "team-1" },
                async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify({
                        id: "team-1",
                        name: "platform",
                        role: "member",
                        system_created: false,
                    }));
                },
            ),
        );

        expect(identity).toEqual({
            name: "platform",
            id: "team-1",
            source: "env_id",
            status: "valid",
            envVar: "OO_TEAM_ID",
        });
        expect(requests[0]?.url).toBe(
            "https://relation-control.oomol.com/v1/teams/team-1",
        );
    });

    test("keeps the id and reports the reason when the lookup fails", async () => {
        expect(await resolveDefaultTeamIdentity(
            { account: testAccount, configuredTeam: undefined },
            createContext(
                { OO_TEAM_ID: "team-1" },
                async () => new Response("{}", { status: 403 }),
            ),
        )).toEqual({
            name: null,
            id: "team-1",
            source: "env_id",
            status: "not_a_member",
            envVar: "OO_TEAM_ID",
        });
    });

    // Reading the local default must not start requiring a login.
    test("skips the lookup without an account instead of failing", async () => {
        let requested = false;
        const identity = await resolveDefaultTeamIdentity(
            { account: undefined, configuredTeam: undefined },
            createContext({ OO_TEAM_ID: "team-1" }, async () => {
                requested = true;

                return new Response("{}", { status: 200 });
            }),
        );

        expect(identity).toEqual({
            name: null,
            id: "team-1",
            source: "env_id",
            status: "no_credential",
            envVar: "OO_TEAM_ID",
        });
        expect(requested).toBe(false);
    });

    test("prefers OO_TEAM_ID over OO_TEAM_NAME and the config default", async () => {
        const identity = await resolveDefaultTeamIdentity(
            { account: testAccount, configuredTeam: "acme" },
            createContext(
                { OO_TEAM_ID: "team-1", OO_TEAM_NAME: "beta" },
                async () => new Response(JSON.stringify({
                    id: "team-1",
                    name: "platform",
                    role: "member",
                    system_created: false,
                })),
            ),
        );

        expect(identity).toMatchObject({ source: "env_id", name: "platform" });
    });
});

describe("formatTeamIdentityValue", () => {
    const translator = createTranslator("en");

    test("shows the name with its id once both are known", () => {
        expect(formatTeamIdentityValue(
            {
                name: "platform",
                id: "team-1",
                source: "env_id",
                status: "valid",
            },
            translator,
        )).toBe("platform (team-1)");
    });

    test.each([
        {
            case: "name only",
            identity: { name: "acme", id: null },
            expected: "acme",
        },
        {
            case: "id only",
            identity: { name: null, id: "team-1" },
            expected: "team-1",
        },
    ])("falls back to the $case", ({ expected, identity }) => {
        expect(formatTeamIdentityValue(
            { ...identity, source: "config", status: null },
            translator,
        )).toBe(expected);
    });
});

describe("appendTeamIdentityStatus", () => {
    const translator = createTranslator("en");

    // A bare id with no explanation is exactly the output this feature removes,
    // and the reason has to land last rather than mid-line.
    test("appends the reason a failed lookup gives to the finished line", () => {
        expect(appendTeamIdentityStatus(
            "team-1 (via OO_TEAM_ID)",
            {
                name: null,
                id: "team-1",
                source: "env_id",
                status: "not_a_member",
            },
            translator,
        )).toBe(
            "team-1 (via OO_TEAM_ID) — the active account is not a member of this team",
        );
    });

    test.each([
        { case: "a resolved lookup", status: "valid" as const },
        { case: "an unattempted lookup", status: null },
    ])("leaves the line untouched for $case", ({ status }) => {
        expect(appendTeamIdentityStatus(
            "acme (via OO_TEAM_NAME)",
            { name: "acme", id: null, source: "env_name", status },
            translator,
        )).toBe("acme (via OO_TEAM_NAME)");
    });
});

describe("teamNameStatusForTelemetry", () => {
    test.each([
        { case: "no identity", identity: undefined, expected: "none" },
        {
            case: "an unattempted lookup",
            identity: {
                name: "acme",
                id: null,
                source: "config" as const,
                status: null,
            },
            expected: "none",
        },
        {
            case: "a resolved lookup",
            identity: {
                name: "platform",
                id: "team-1",
                source: "env_id" as const,
                status: "valid" as const,
            },
            expected: "valid",
        },
    ])("collapses $case to $expected", ({ expected, identity }) => {
        expect(teamNameStatusForTelemetry(identity)).toBe(expected);
    });
});

function createContext(
    env: Record<string, string | undefined>,
    fetcher: Fetcher = async () => new Response("{}", { status: 200 }),
) {
    return {
        env,
        fetcher,
        logger: pino({ enabled: false }),
    };
}
