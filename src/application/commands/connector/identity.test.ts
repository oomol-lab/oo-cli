import { describe, expect, test } from "bun:test";

import {
    connectorIdentityHeaders,
    resolveConnectorIdentity,
} from "./identity.ts";

describe("resolveConnectorIdentity", () => {
    test("defaults to personal when nothing is provided", () => {
        expect(resolveConnectorIdentity({
            configTeam: undefined,
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
            teamFlag: "",
            personalFlag: false,
        })).toEqual({
            identity: { team: "config-team" },
            source: "config",
        });
    });
});

describe("connectorIdentityHeaders", () => {
    test("returns the team header for a team identity", () => {
        expect(connectorIdentityHeaders({ team: "acme" })).toEqual({
            "x-oo-team-name": "acme",
        });
    });

    test("returns no headers for the personal identity", () => {
        expect(connectorIdentityHeaders({})).toEqual({});
        expect(connectorIdentityHeaders(undefined)).toEqual({});
    });
});
