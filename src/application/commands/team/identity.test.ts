import type { Fetcher } from "../../contracts/cli.ts";

import type { TeamIdentity } from "./identity.ts";
import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createFailedToOpenSocketError,
    defaultLoginDefaultTeamResponse,
    expectCliUserError,
    toRequest,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import {
    appendTeamIdentityStatus,
    formatTeamIdentityValue,
    readTeamFlag,
    requireValidTeamIdentity,
    resolveTeamIdentity,
    teamNameStatusForTelemetry,
    teamOption,
    teamSourceForTelemetry,
} from "./identity.ts";

const testAccount = {
    apiKey: "api-secret-1",
    endpoint: "oomol.com",
};

const teamsResponse = {
    teams: [
        { id: "team-1", name: "acme", role: "creator", system_created: false },
        { id: "team-2", name: "beta", role: "member", system_created: false },
    ],
};

const teamByIdResponse = {
    id: "team-1",
    name: "platform",
    role: "member",
    system_created: false,
};

describe("resolveTeamIdentity precedence", () => {
    test("resolves to no team identity when nothing selects a team", async () => {
        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: undefined,
                resolveAgainstBackend: true,
            },
            createContext({}),
        )).toBeUndefined();
    });

    test("team flag overrides the env override and the config default without a lookup", async () => {
        let requested = false;

        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: { id: null, name: "config-team" },
                teamFlag: "flag-team",
                resolveAgainstBackend: true,
            },
            createContext({ OO_TEAM_ID: "team-1" }, async () => {
                requested = true;

                return new Response(JSON.stringify(teamByIdResponse));
            }),
        )).toEqual({
            name: "flag-team",
            id: null,
            source: "flag",
            status: null,
        });
        expect(requested).toBe(false);
    });

    // One empty-value policy across the tiers: blank means unset.
    test.each([
        { case: "an empty team flag", teamFlag: "" },
        { case: "a whitespace team flag", teamFlag: "   " },
    ])("treats $case as absent and falls through to config", async ({ teamFlag }) => {
        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: { id: null, name: "config-team" },
                teamFlag,
                resolveAgainstBackend: true,
            },
            createContext({}),
        )).toEqual({
            name: "config-team",
            id: null,
            source: "account",
            status: null,
        });
    });

    test("treats a blank configured team as unset", async () => {
        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: { id: null, name: "   " },
                resolveAgainstBackend: true,
            },
            createContext({}),
        )).toBeUndefined();
    });

    test("resolves the config default offline with no lookup", async () => {
        let requested = false;

        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: { id: null, name: "acme" },
                resolveAgainstBackend: true,
            },
            createContext({}, async () => {
                requested = true;

                return new Response(JSON.stringify(teamsResponse));
            }),
        )).toEqual({
            name: "acme",
            id: null,
            source: "account",
            status: null,
        });
        expect(requested).toBe(false);
    });

    test("prefers OO_TEAM_ID over OO_TEAM_NAME and the config default", async () => {
        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: { id: null, name: "acme" },
                resolveAgainstBackend: true,
            },
            createContext(
                { OO_TEAM_ID: "team-1", OO_TEAM_NAME: "beta" },
                async () => new Response(JSON.stringify(teamByIdResponse)),
            ),
        )).toMatchObject({ source: "env_id", name: "platform", id: "team-1" });
    });

    test("treats blank env variables as unset and falls through to config", async () => {
        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: { id: null, name: "acme" },
                resolveAgainstBackend: true,
            },
            createContext({ OO_TEAM_ID: "   ", OO_TEAM_NAME: "" }),
        )).toMatchObject({ source: "account", name: "acme" });
    });

    test("trims the env-supplied value", async () => {
        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: undefined,
                resolveAgainstBackend: false,
            },
            createContext({ OO_TEAM_ID: " team-1 " }),
        )).toMatchObject({ source: "env_id", id: "team-1" });
    });

    test("falls back to OO_TEAM_NAME when OO_TEAM_ID is blank", async () => {
        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: undefined,
                resolveAgainstBackend: false,
            },
            createContext({ OO_TEAM_ID: "  ", OO_TEAM_NAME: "acme" }),
        )).toMatchObject({
            source: "env_name",
            name: "acme",
            envVar: "OO_TEAM_NAME",
        });
    });
});

describe("resolveTeamIdentity server-side default tier", () => {
    test("asks the backend for the server-side default team when nothing local selects one", async () => {
        const requests: Request[] = [];

        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: undefined,
                resolveAgainstBackend: true,
                resolveCurrentName: true,
            },
            createContext({}, async (input, init) => {
                requests.push(toRequest(input, init));

                return new Response(JSON.stringify(defaultLoginDefaultTeamResponse));
            }),
        )).toEqual({
            name: "alice-team",
            id: "team-system-1",
            source: "backend_default",
            status: "valid",
        });
        expect(requests.map(request => request.url)).toEqual([
            "https://relation-control.oomol.com/v1/me/default-team",
        ]);
        expect(requests[0]?.headers.get("authorization")).toBe("api-secret-1");
    });

    // The lookup is opt-in and last: header-only execution paths get the same
    // server-side default from the gateway without spending a request, and
    // anything above it in the ladder wins without one.
    test.each([
        {
            case: "the caller does not opt in",
            input: { account: testAccount, resolveAgainstBackend: true },
            expected: undefined,
        },
        {
            case: "the resolution is offline",
            input: {
                account: testAccount,
                resolveAgainstBackend: false,
                resolveCurrentName: true,
            },
            expected: undefined,
        },
        {
            case: "no account can authenticate it",
            input: {
                account: undefined,
                resolveAgainstBackend: true,
                resolveCurrentName: true,
            },
            expected: undefined,
        },
    ])("skips the lookup when $case", async ({ input, expected }) => {
        let requested = false;

        expect(await resolveTeamIdentity(
            { defaultTeam: undefined, ...input },
            createContext({}, async () => {
                requested = true;

                return new Response(JSON.stringify(defaultLoginDefaultTeamResponse));
            }),
        )).toEqual(expected);
        expect(requested).toBe(false);
    });

    // Neither answer may fail the run: the header-less request worked before
    // this tier existed and keeps working through the gateway's own default.
    test.each([
        {
            case: "the backend reports no default team",
            fetcher: (async () => new Response("", { status: 404 })) satisfies Fetcher,
        },
        {
            case: "the lookup fails",
            fetcher: (async () => {
                throw new Error("connection reset");
            }) satisfies Fetcher,
        },
    ])("resolves to no team identity when $case", async ({ fetcher }) => {
        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: undefined,
                resolveAgainstBackend: true,
                resolveCurrentName: true,
            },
            createContext({}, fetcher),
        )).toBeUndefined();
    });
});

// Both env directions get the same policy: complete the missing dimension,
// validate through the backend, record the outcome as a status.
// The saved name is only the name the team had when it was saved; callers
// that need the current one refresh it through the saved id.
describe("resolveTeamIdentity current-name refresh", () => {
    const savedDefault = { id: "team-1", name: "old-name" };

    test("refreshes a saved default through its id", async () => {
        const requests: Request[] = [];

        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: savedDefault,
                resolveAgainstBackend: true,
                resolveCurrentName: true,
            },
            createContext({}, async (input, init) => {
                requests.push(toRequest(input, init));

                return new Response(JSON.stringify({
                    id: "team-1",
                    name: "acme",
                    role: "creator",
                    system_created: false,
                }));
            }),
        )).toEqual({
            name: "acme",
            id: "team-1",
            source: "account",
            status: "valid",
        });
        expect(requests.map(request => request.url)).toEqual([
            "https://relation-control.oomol.com/v1/teams/team-1",
        ]);
        expect(requests[0]?.headers.get("authorization")).toBe("api-secret-1");
    });

    // The saved values stay in the identity so a report can still show them;
    // the status carries what the backend said instead.
    test.each([
        {
            case: "the refresh is refused",
            fetcher: (async () => new Response("{}", { status: 410 })) satisfies Fetcher,
            status: "deleted",
        },
        {
            case: "the refresh fails",
            fetcher: (async () => {
                throw new Error("connection reset");
            }) satisfies Fetcher,
            status: "request_failed",
        },
    ])("keeps the saved values with the reason when $case", async ({ fetcher, status }) => {
        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: savedDefault,
                resolveAgainstBackend: true,
                resolveCurrentName: true,
            },
            createContext({}, fetcher),
        )).toEqual({
            name: "old-name",
            id: "team-1",
            source: "account",
            status,
        });
    });

    // A default migrated from the legacy setting has no id to refresh by, so
    // the memberships complete it — and answer whether the name is still
    // one of the account's teams.
    test.each([
        {
            case: "completes a name-only default through the memberships",
            name: "acme",
            expected: { name: "acme", id: "team-1", source: "account", status: "valid" },
        },
        {
            case: "reports a name-only default that is no longer among the memberships",
            name: "renamed-away",
            expected: { name: "renamed-away", id: null, source: "account", status: "not_a_member" },
        },
    ])("$case", async ({ name, expected }) => {
        const requests: Request[] = [];

        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: { id: null, name },
                resolveAgainstBackend: true,
                resolveCurrentName: true,
            },
            createContext({}, async (input, init) => {
                requests.push(toRequest(input, init));

                return new Response(JSON.stringify(teamsResponse));
            }),
        )).toEqual(expected);
        expect(requests.map(request => request.url)).toEqual([
            "https://relation-control.oomol.com/v1/me/teams",
        ]);
    });

    test("reports the saved default as is when the caller does not need the current name", async () => {
        let requested = false;

        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: savedDefault,
                resolveAgainstBackend: true,
            },
            createContext({}, async () => {
                requested = true;

                return new Response("{}");
            }),
        )).toEqual({
            name: "old-name",
            id: "team-1",
            source: "account",
            status: null,
        });
        expect(requested).toBe(false);
    });
});

describe("resolveTeamIdentity env validation", () => {
    test("resolves OO_TEAM_ID to its team name through the singular team route", async () => {
        const requests: Request[] = [];
        const identity = await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: { id: null, name: "acme" },
                resolveAgainstBackend: true,
            },
            createContext({ OO_TEAM_ID: "team-1" }, async (input, init) => {
                requests.push(toRequest(input, init));

                return new Response(JSON.stringify(teamByIdResponse));
            }),
        );

        expect(identity).toEqual({
            name: "platform",
            id: "team-1",
            source: "env_id",
            status: "valid",
            envVar: "OO_TEAM_ID",
        });
        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toBe(
            "https://relation-control.oomol.com/v1/teams/team-1",
        );
        expect(requests[0]?.headers.get("authorization")).toBe("api-secret-1");
    });

    test("resolves OO_TEAM_NAME to its team id through the membership listing", async () => {
        const requests: Request[] = [];
        const identity = await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: undefined,
                resolveAgainstBackend: true,
            },
            createContext({ OO_TEAM_NAME: "beta" }, async (input, init) => {
                requests.push(toRequest(input, init));

                return new Response(JSON.stringify(teamsResponse));
            }),
        );

        expect(identity).toEqual({
            name: "beta",
            id: "team-2",
            source: "env_name",
            status: "valid",
            envVar: "OO_TEAM_NAME",
        });
        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toBe(
            "https://relation-control.oomol.com/v1/me/teams",
        );
        expect(requests[0]?.headers.get("authorization")).toBe("api-secret-1");
    });

    test("keeps the id and reports the reason when the id lookup is refused", async () => {
        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: undefined,
                resolveAgainstBackend: true,
            },
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

    test("keeps the name and reports not_a_member when it is not among the memberships", async () => {
        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: undefined,
                resolveAgainstBackend: true,
            },
            createContext(
                { OO_TEAM_NAME: "ghost" },
                async () => new Response(JSON.stringify(teamsResponse)),
            ),
        )).toEqual({
            name: "ghost",
            id: null,
            source: "env_name",
            status: "not_a_member",
            envVar: "OO_TEAM_NAME",
        });
    });

    test("reports a failed membership listing as request_failed for OO_TEAM_NAME", async () => {
        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: undefined,
                resolveAgainstBackend: true,
            },
            createContext(
                { OO_TEAM_NAME: "beta" },
                async () => new Response("nope", { status: 500 }),
            ),
        )).toMatchObject({ source: "env_name", status: "request_failed" });
    });

    test("reports a failed id lookup as request_failed while keeping the id", async () => {
        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: undefined,
                resolveAgainstBackend: true,
            },
            createContext(
                { OO_TEAM_ID: "team-1" },
                async () => new Response("nope", { status: 500 }),
            ),
        )).toEqual({
            name: null,
            id: "team-1",
            source: "env_id",
            status: "request_failed",
            envVar: "OO_TEAM_ID",
        });
    });

    test("reports a sandbox-blocked name lookup separately", async () => {
        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: undefined,
                resolveAgainstBackend: true,
            },
            createContext({ OO_TEAM_NAME: "beta" }, async () => {
                throw createFailedToOpenSocketError("network is restricted");
            }),
        )).toMatchObject({ status: "request_failed_sandbox" });
    });

    // Reading the local default must not start requiring a login.
    test.each([
        {
            case: "OO_TEAM_ID",
            env: { OO_TEAM_ID: "team-1" },
            expected: {
                name: null,
                id: "team-1",
                source: "env_id",
                status: "no_credential",
                envVar: "OO_TEAM_ID",
            },
        },
        {
            case: "OO_TEAM_NAME",
            env: { OO_TEAM_NAME: "beta" },
            expected: {
                name: "beta",
                id: null,
                source: "env_name",
                status: "no_credential",
                envVar: "OO_TEAM_NAME",
            },
        },
    ])("downgrades the $case lookup to no_credential without an account", async ({ env, expected }) => {
        let requested = false;

        expect(await resolveTeamIdentity(
            {
                account: undefined,
                defaultTeam: undefined,
                resolveAgainstBackend: true,
            },
            createContext(env, async () => {
                requested = true;

                return new Response("{}", { status: 200 });
            }),
        )).toEqual(expected as TeamIdentity);
        expect(requested).toBe(false);
    });

    // `--dry-run` and offline reporting stay offline for every source.
    test.each([
        {
            case: "OO_TEAM_ID",
            env: { OO_TEAM_ID: "team-1" },
            expected: {
                name: null,
                id: "team-1",
                source: "env_id",
                status: null,
                envVar: "OO_TEAM_ID",
            },
        },
        {
            case: "OO_TEAM_NAME",
            env: { OO_TEAM_NAME: "beta" },
            expected: {
                name: "beta",
                id: null,
                source: "env_name",
                status: null,
                envVar: "OO_TEAM_NAME",
            },
        },
    ])("keeps the bare $case identity without a lookup when offline", async ({ env, expected }) => {
        let requested = false;

        expect(await resolveTeamIdentity(
            {
                account: testAccount,
                defaultTeam: undefined,
                resolveAgainstBackend: false,
            },
            createContext(env, async () => {
                requested = true;

                return new Response("{}", { status: 200 });
            }),
        )).toEqual(expected as TeamIdentity);
        expect(requested).toBe(false);
    });
});

describe("requireValidTeamIdentity", () => {
    const passThroughCases: { case: string; identity: TeamIdentity | undefined }[] = [
        { case: "no team identity", identity: undefined },
        {
            case: "a flag identity",
            identity: { name: "flag-team", id: null, source: "flag", status: null },
        },
        {
            case: "a config identity",
            identity: { name: "acme", id: null, source: "account", status: null },
        },
        {
            case: "a validated env identity",
            identity: {
                name: "platform",
                id: "team-1",
                source: "env_id",
                status: "valid",
                envVar: "OO_TEAM_ID",
            },
        },
        {
            case: "an offline env identity",
            identity: {
                name: null,
                id: "team-1",
                source: "env_id",
                status: null,
                envVar: "OO_TEAM_ID",
            },
        },
    ];

    test.each(passThroughCases)("passes $case through", ({ identity }) => {
        expect(requireValidTeamIdentity(identity, createGateContext()))
            .toEqual(identity);
    });

    // The backend could not answer, so the gateway stays the final judge: the
    // run proceeds with the dimension the override supplied, in either
    // direction.
    test.each([
        {
            status: "request_failed" as const,
            identity: {
                name: "beta",
                id: null,
                source: "env_name",
                status: "request_failed",
                envVar: "OO_TEAM_NAME",
            } as TeamIdentity,
        },
        {
            status: "request_failed_sandbox" as const,
            identity: {
                name: "beta",
                id: null,
                source: "env_name",
                status: "request_failed_sandbox",
                envVar: "OO_TEAM_NAME",
            } as TeamIdentity,
        },
        {
            status: "request_failed" as const,
            identity: {
                name: null,
                id: "team-1",
                source: "env_id",
                status: "request_failed",
                envVar: "OO_TEAM_ID",
            } as TeamIdentity,
        },
    ])("passes an unanswerable $identity.source lookup through ($status)", ({ identity }) => {
        expect(requireValidTeamIdentity(identity, createGateContext()))
            .toEqual(identity);
    });

    test("throws the auth-required error when the lookup had no credential", () => {
        const error = expectCliUserError(() => requireValidTeamIdentity(
            {
                name: null,
                id: "team-1",
                source: "env_id",
                status: "no_credential",
                envVar: "OO_TEAM_ID",
            },
            createGateContext(),
        ));

        expect(error.key).toBe("errors.auth.required");
        expect(error.exitCode).toBe(1);
    });

    test("rejects a saved default the refresh could not confirm with the account remedy", () => {
        const error = expectCliUserError(() => requireValidTeamIdentity(
            {
                name: "acme",
                id: "team-1",
                source: "account",
                status: "deleted",
            },
            createGateContext(),
        ));

        expect(error.key).toBe("errors.team.accountDefaultNotAccessible");
        expect(error.exitCode).toBe(1);
        expect(error.params).toEqual({
            reason: "this team has been deleted",
            team: "acme",
        });
    });

    test("rejects an env name that is not accessible", () => {
        const error = expectCliUserError(() => requireValidTeamIdentity(
            {
                name: "ghost",
                id: null,
                source: "env_name",
                status: "not_a_member",
                envVar: "OO_TEAM_NAME",
            },
            createGateContext(),
        ));

        expect(error.key).toBe("errors.team.envNameNotAccessible");
        expect(error.exitCode).toBe(1);
        expect(error.params).toEqual({ team: "ghost" });
    });

    // A definite backend refusal blocks the run with the reason spelled out.
    test.each([
        {
            status: "not_a_member" as const,
            reason: "the active account is not a member of this team",
        },
        {
            status: "not_found" as const,
            reason: "no team exists with this id",
        },
        {
            status: "deleted" as const,
            reason: "this team has been deleted",
        },
    ])("rejects an env id refused with $status", ({ status, reason }) => {
        const error = expectCliUserError(() => requireValidTeamIdentity(
            {
                name: null,
                id: "team-9",
                source: "env_id",
                status,
                envVar: "OO_TEAM_ID",
            },
            createGateContext(),
        ));

        expect(error.key).toBe("errors.team.envIdNotAccessible");
        expect(error.exitCode).toBe(1);
        expect(error.params).toEqual({ reason, teamId: "team-9" });
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
            { ...identity, source: "account", status: null },
            translator,
        )).toBe(expected);
    });
});

describe("appendTeamIdentityStatus", () => {
    const translator = createTranslator("en");

    // A bare value with no explanation is exactly the output this feature
    // removes, and the reason has to land last rather than mid-line.
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
                source: "account" as const,
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

describe("readTeamFlag", () => {
    test.each([
        { case: "an empty --team value", team: "" },
        { case: "a whitespace --team value", team: "   " },
    ])("rejects $case", ({ team }) => {
        const error = expectCliUserError(() => readTeamFlag({ team }));

        expect(error.key).toBe("errors.team.teamEmpty");
        expect(error.exitCode).toBe(2);
    });

    test.each([
        { case: "no flags", expected: undefined, input: {} },
        { case: "a padded --team value", expected: "acme", input: { team: "  acme  " } },
    ])("returns $expected for $case", ({ expected, input }) => {
        expect(readTeamFlag(input)).toBe(expected);
    });
});

describe("teamOption", () => {
    test("declares the shared flag with the caller's description key", () => {
        expect(teamOption("options.connectorRunTeam")).toEqual({
            name: "team",
            longFlag: "--team",
            valueName: "team",
            descriptionKey: "options.connectorRunTeam",
        });
    });
});

describe("teamSourceForTelemetry", () => {
    test.each([
        { case: "no team identity", expected: "none", identity: undefined },
        {
            case: "an account default",
            expected: "account",
            identity: { id: null, name: "acme", source: "account", status: null } as const,
        },
        {
            case: "the backend's default team",
            expected: "backend_default",
            identity: {
                id: "team-system-1",
                name: "alice-team",
                source: "backend_default",
                status: "valid",
            } as const,
        },
    ])("reports $expected for $case", ({ expected, identity }) => {
        expect(teamSourceForTelemetry(identity)).toBe(expected);
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

function createGateContext() {
    return {
        logger: pino({ enabled: false }),
        translator: createTranslator("en"),
    };
}
