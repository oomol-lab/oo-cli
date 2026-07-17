import type { Fetcher } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import { expectCliUserError, toRequest } from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import {
    connectorIdentityHeaders,
    resolveConnectorIdentity,
    resolveConnectorIdentityWithEnv,
} from "./identity.ts";

const oomolTarget = {
    authorization: "api-secret-1",
    cacheEndpoint: "oomol.com",
};

const teamsResponse = {
    teams: [
        { id: "team-1", name: "acme", role: "creator" },
        { id: "team-2", name: "beta", role: "member" },
    ],
};

describe("resolveConnectorIdentity", () => {
    test("defaults to personal when nothing is provided", () => {
        expect(resolveConnectorIdentity({
            configTeam: undefined,
            envOverride: undefined,
            teamFlag: undefined,
            personalFlag: false,
        })).toEqual({
            identity: {},
            source: "personal",
        });
    });

    test("uses the team flag over the configured default", () => {
        expect(resolveConnectorIdentity({
            configTeam: "config-team",
            envOverride: undefined,
            teamFlag: "flag-team",
            personalFlag: false,
        })).toEqual({
            identity: { team: "flag-team" },
            source: "flag",
        });
    });

    test("falls back to the configured team when no flag is set", () => {
        expect(resolveConnectorIdentity({
            configTeam: "config-team",
            envOverride: undefined,
            teamFlag: undefined,
            personalFlag: false,
        })).toEqual({
            identity: { team: "config-team" },
            source: "config",
        });
    });

    test("personal flag overrides both the team flag and the configured default", () => {
        expect(resolveConnectorIdentity({
            configTeam: "config-team",
            envOverride: undefined,
            teamFlag: "flag-team",
            personalFlag: true,
        })).toEqual({
            identity: {},
            source: "personal",
        });
    });

    test("treats an empty team flag as absent and falls back to config", () => {
        expect(resolveConnectorIdentity({
            configTeam: "config-team",
            envOverride: undefined,
            teamFlag: "",
            personalFlag: false,
        })).toEqual({
            identity: { team: "config-team" },
            source: "config",
        });
    });

    test("uses the env team id over the configured default", () => {
        expect(resolveConnectorIdentity({
            configTeam: "config-team",
            envOverride: { kind: "id", value: "team-1" },
            teamFlag: undefined,
            personalFlag: false,
        })).toEqual({
            identity: { teamId: "team-1" },
            source: "env_id",
        });
    });

    test("uses the env team name over the configured default", () => {
        expect(resolveConnectorIdentity({
            configTeam: "config-team",
            envOverride: { kind: "name", value: "acme" },
            teamFlag: undefined,
            personalFlag: false,
        })).toEqual({
            identity: { team: "acme" },
            source: "env_name",
        });
    });

    test("uses the team flag over the env override", () => {
        expect(resolveConnectorIdentity({
            configTeam: undefined,
            envOverride: { kind: "id", value: "team-1" },
            teamFlag: "flag-team",
            personalFlag: false,
        })).toEqual({
            identity: { team: "flag-team" },
            source: "flag",
        });
    });

    test("personal flag overrides the env override", () => {
        expect(resolveConnectorIdentity({
            configTeam: undefined,
            envOverride: { kind: "name", value: "acme" },
            teamFlag: undefined,
            personalFlag: true,
        })).toEqual({
            identity: {},
            source: "personal",
        });
    });
});

describe("resolveConnectorIdentityWithEnv", () => {
    test("passes the env team id through without a resolution request", async () => {
        let requested = false;
        const resolved = await resolveConnectorIdentityWithEnv(
            {
                configTeam: "config-team",
                target: oomolTarget,
                teamFlag: undefined,
                personalFlag: false,
            },
            createIdentityContext({
                env: { OO_TEAM_ID: "team-9" },
                fetcher: async () => {
                    requested = true;

                    return new Response(JSON.stringify(teamsResponse));
                },
            }),
        );

        expect(resolved).toEqual({
            identity: { teamId: "team-9" },
            source: "env_id",
        });
        expect(requested).toBe(false);
    });

    test("resolves the env team name to its id through the membership listing", async () => {
        const requests: Request[] = [];
        const resolved = await resolveConnectorIdentityWithEnv(
            {
                configTeam: undefined,
                target: oomolTarget,
                teamFlag: undefined,
                personalFlag: false,
            },
            createIdentityContext({
                env: { OO_TEAM_NAME: "beta" },
                fetcher: async (input, init) => {
                    requests.push(toRequest(input, init));

                    return new Response(JSON.stringify(teamsResponse));
                },
            }),
        );

        expect(resolved).toEqual({
            identity: { team: "beta", teamId: "team-2" },
            source: "env_name",
        });
        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toBe(
            "https://relation-control.oomol.com/v1/me/teams",
        );
        expect(requests[0]?.headers.get("authorization")).toBe("api-secret-1");
    });

    test("fails when the env team name is not among the account teams", async () => {
        const error = await expectCliUserError(resolveConnectorIdentityWithEnv(
            {
                configTeam: undefined,
                target: oomolTarget,
                teamFlag: undefined,
                personalFlag: false,
            },
            createIdentityContext({
                env: { OO_TEAM_NAME: "ghost" },
                fetcher: async () => new Response(JSON.stringify(teamsResponse)),
            }),
        ));

        expect(error.key).toBe("errors.team.envNameNotAccessible");
        expect(error.exitCode).toBe(1);
    });

    test("prefers the env team id when both env variables are set", async () => {
        let requested = false;
        const resolved = await resolveConnectorIdentityWithEnv(
            {
                configTeam: undefined,
                target: oomolTarget,
                teamFlag: undefined,
                personalFlag: false,
            },
            createIdentityContext({
                env: { OO_TEAM_ID: "team-1", OO_TEAM_NAME: "beta" },
                fetcher: async () => {
                    requested = true;

                    return new Response(JSON.stringify(teamsResponse));
                },
            }),
        );

        expect(resolved).toEqual({
            identity: { teamId: "team-1" },
            source: "env_id",
        });
        expect(requested).toBe(false);
    });

    test("skips the env resolution entirely when a flag wins", async () => {
        let requested = false;
        const resolved = await resolveConnectorIdentityWithEnv(
            {
                configTeam: undefined,
                target: oomolTarget,
                teamFlag: "flag-team",
                personalFlag: false,
            },
            createIdentityContext({
                env: { OO_TEAM_NAME: "beta" },
                fetcher: async () => {
                    requested = true;

                    return new Response(JSON.stringify(teamsResponse));
                },
            }),
        );

        expect(resolved).toEqual({
            identity: { team: "flag-team" },
            source: "flag",
        });
        expect(requested).toBe(false);
    });

    test("fails the env name resolution when the target carries no credential", async () => {
        const error = await expectCliUserError(resolveConnectorIdentityWithEnv(
            {
                configTeam: undefined,
                target: { cacheEndpoint: "oomol.com" },
                teamFlag: undefined,
                personalFlag: false,
            },
            createIdentityContext({
                env: { OO_TEAM_NAME: "beta" },
                fetcher: async () => new Response(JSON.stringify(teamsResponse)),
            }),
        ));

        expect(error.key).toBe("errors.auth.required");
    });
});

describe("connectorIdentityHeaders", () => {
    test("returns the team header for a team identity", () => {
        expect(connectorIdentityHeaders({ team: "acme" })).toEqual({
            "x-oo-team-name": "acme",
        });
    });

    test("returns the team id header for an id identity", () => {
        expect(connectorIdentityHeaders({ teamId: "team-1" })).toEqual({
            "x-oo-team-id": "team-1",
        });
    });

    test("returns both headers when the name and id are known", () => {
        expect(connectorIdentityHeaders({ team: "acme", teamId: "team-1" }))
            .toEqual({
                "x-oo-team-name": "acme",
                "x-oo-team-id": "team-1",
            });
    });

    test("returns no headers for the personal identity", () => {
        expect(connectorIdentityHeaders({})).toEqual({});
        expect(connectorIdentityHeaders(undefined)).toEqual({});
    });
});

function createIdentityContext(options: {
    env: Record<string, string | undefined>;
    fetcher: Fetcher;
}) {
    return {
        env: options.env,
        fetcher: options.fetcher,
        logger: pino({ enabled: false }),
        translator: createTranslator("en"),
    };
}
