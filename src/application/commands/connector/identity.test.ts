import { describe, expect, test } from "bun:test";

import {
    connectorIdentityHeaders,
    resolveConnectorIdentity,
} from "./identity.ts";

describe("resolveConnectorIdentity", () => {
    test("defaults to personal when nothing is provided", () => {
        expect(resolveConnectorIdentity({
            configOrganization: undefined,
            organizationFlag: undefined,
            personalFlag: false,
        })).toEqual({
            identity: {},
            source: "personal",
        });
    });

    test("uses the organization flag over the configured default", () => {
        expect(resolveConnectorIdentity({
            configOrganization: "config-org",
            organizationFlag: "flag-org",
            personalFlag: false,
        })).toEqual({
            identity: { organization: "flag-org" },
            source: "flag",
        });
    });

    test("falls back to the configured organization when no flag is set", () => {
        expect(resolveConnectorIdentity({
            configOrganization: "config-org",
            organizationFlag: undefined,
            personalFlag: false,
        })).toEqual({
            identity: { organization: "config-org" },
            source: "config",
        });
    });

    test("personal flag overrides both the organization flag and the configured default", () => {
        expect(resolveConnectorIdentity({
            configOrganization: "config-org",
            organizationFlag: "flag-org",
            personalFlag: true,
        })).toEqual({
            identity: {},
            source: "personal",
        });
    });

    test("treats an empty organization flag as absent and falls back to config", () => {
        expect(resolveConnectorIdentity({
            configOrganization: "config-org",
            organizationFlag: "",
            personalFlag: false,
        })).toEqual({
            identity: { organization: "config-org" },
            source: "config",
        });
    });
});

describe("connectorIdentityHeaders", () => {
    test("returns the organization header for an organization identity", () => {
        expect(connectorIdentityHeaders({ organization: "acme" })).toEqual({
            "x-oo-organization": "acme",
        });
    });

    test("returns no headers for the personal identity", () => {
        expect(connectorIdentityHeaders({})).toEqual({});
        expect(connectorIdentityHeaders(undefined)).toEqual({});
    });
});
