import { describe, expect, test } from "bun:test";

import { connectorIdentityHeaders, connectorTeamAccount } from "./identity.ts";

describe("connectorIdentityHeaders", () => {
    test("returns the team header for a name-only identity", () => {
        expect(connectorIdentityHeaders({
            name: "acme",
            id: null,
            source: "config",
            status: null,
        })).toEqual({
            "x-oo-team-name": "acme",
        });
    });

    test("returns the team id header for an id-only identity", () => {
        expect(connectorIdentityHeaders({
            name: null,
            id: "team-1",
            source: "env_id",
            status: "request_failed",
            envVar: "OO_TEAM_ID",
        })).toEqual({
            "x-oo-team-id": "team-1",
        });
    });

    test("returns both headers when the name and id are known", () => {
        expect(connectorIdentityHeaders({
            name: "acme",
            id: "team-1",
            source: "env_name",
            status: "valid",
            envVar: "OO_TEAM_NAME",
        })).toEqual({
            "x-oo-team-name": "acme",
            "x-oo-team-id": "team-1",
        });
    });

    test("returns no headers for the personal identity", () => {
        expect(connectorIdentityHeaders(undefined)).toEqual({});
    });
});

describe("connectorTeamAccount", () => {
    test("lends the target credential to the identity lookups", () => {
        expect(connectorTeamAccount({
            authorization: "api-secret-1",
            cacheEndpoint: "oomol.com",
        })).toEqual({
            apiKey: "api-secret-1",
            endpoint: "oomol.com",
        });
    });

    test("returns undefined when the target carries no credential", () => {
        expect(connectorTeamAccount({
            authorization: undefined,
            cacheEndpoint: "oomol.com",
        })).toBeUndefined();
    });
});
