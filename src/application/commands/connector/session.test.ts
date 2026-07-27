import type { Fetcher } from "../../contracts/cli.ts";
import type { AuthFile } from "../../schemas/auth.ts";
import type { ConnectorFile } from "../../schemas/connector.ts";
import type { AppSettings } from "../../schemas/settings.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createAuthStore,
    createInMemoryConnectorStore,
    createRecordingTelemetry,
    createSettingsStore,
    expectCliUserError,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { createConnectorSchemaCacheScope } from "./schema-cache.ts";
import { resolveConnectorSession, teamIdentityOptions } from "./session.ts";

const testAccount = {
    id: "user-1",
    name: "Test User",
    apiKey: "api-secret-1",
    endpoint: "oomol.com",
};

const teamsResponse = {
    teams: [
        { id: "team-1", name: "acme", role: "creator", system_created: false },
    ],
};

const teamByIdResponse = {
    id: "team-1",
    name: "platform",
    role: "member",
    system_created: false,
};

describe("resolveConnectorSession flag guards", () => {
    test("rejects combining --team and --personal before resolving anything", async () => {
        // No auth on the context: the guard must fire before target
        // resolution gets a chance to demand a login.
        const context = createSessionContext();

        const error = await expectCliUserError(
            resolveConnectorSession({ personal: true, team: "acme" }, context),
        );

        expect(error.key).toBe("errors.connectorRun.identityConflict");
        expect(error.exitCode).toBe(2);
        expect(context.requests).toHaveLength(0);
    });

    test.each([
        { case: "an empty --team value", team: "" },
        { case: "a whitespace --team value", team: "   " },
    ])("rejects $case", async ({ team }) => {
        const context = createSessionContext();

        const error = await expectCliUserError(
            resolveConnectorSession({ team }, context),
        );

        expect(error.key).toBe("errors.connectorRun.teamEmpty");
        expect(error.exitCode).toBe(2);
        expect(context.requests).toHaveLength(0);
    });

    test("rejects --team for a self-hosted target", async () => {
        const context = createSessionContext({
            env: { OO_CONNECTOR_URL: "http://localhost:3000" },
        });

        const error = await expectCliUserError(
            resolveConnectorSession({ team: "acme" }, context),
        );

        expect(error.key).toBe("errors.connector.teamUnsupported");
        expect(error.exitCode).toBe(2);
        expect(context.requests).toHaveLength(0);
    });
});

describe("resolveConnectorSession on a self-hosted target", () => {
    test("pins the personal identity, ignoring the config default and the env team", async () => {
        const context = createSessionContext({
            env: {
                OO_CONNECTOR_URL: "http://localhost:3000",
                OO_CONNECTOR_TOKEN: "oct_1",
                OO_TEAM_ID: "team-1",
                OO_TEAM_NAME: "acme",
            },
            settings: { identity: { team: "acme" } },
        });

        const session = await resolveConnectorSession({}, context);

        expect(session.identity).toBeUndefined();
        expect(session.target).toEqual({
            authorization: "Bearer oct_1",
            baseUrl: "http://localhost:3000",
            kind: "self_hosted",
            cacheScope: createConnectorSchemaCacheScope({
                accountId: "self-hosted",
                endpoint: "http://localhost:3000",
            }),
        });
        expect(context.requests).toHaveLength(0);
        expect(context.recordedProperties).toEqual([
            { connector_kind: "self_hosted", identity_source: "personal" },
        ]);
    });
});

describe("resolveConnectorSession identity ladder", () => {
    test("resolves to personal when nothing selects a team", async () => {
        const context = createSessionContext({ auth: authFileWith(testAccount) });

        const session = await resolveConnectorSession({}, context);

        expect(session.identity).toBeUndefined();
        expect(session.target).toEqual({
            authorization: "api-secret-1",
            baseUrl: "https://connector.oomol.com",
            kind: "oomol",
            cacheScope: createConnectorSchemaCacheScope({
                accountId: "user-1",
                endpoint: "oomol.com",
            }),
            accountEndpoint: "oomol.com",
        });
        expect(context.recordedProperties).toEqual([
            { connector_kind: "oomol", identity_source: "personal" },
        ]);
    });

    test("forces the personal identity with --personal over the config default and env team", async () => {
        const context = createSessionContext({
            auth: authFileWith(testAccount),
            env: { OO_TEAM_ID: "team-1" },
            settings: { identity: { team: "acme" } },
        });

        const session = await resolveConnectorSession({ personal: true }, context);

        expect(session.identity).toBeUndefined();
        expect(context.requests).toHaveLength(0);
        expect(context.recordedProperties).toEqual([
            { connector_kind: "oomol", identity_source: "personal" },
        ]);
    });

    test("trims the --team flag and selects it without a lookup", async () => {
        const context = createSessionContext({
            auth: authFileWith(testAccount),
            env: { OO_TEAM_ID: "team-1" },
            settings: { identity: { team: "config-team" } },
        });

        const session = await resolveConnectorSession({ team: "  acme  " }, context);

        expect(session.identity).toEqual({
            name: "acme",
            id: null,
            source: "flag",
            status: null,
        });
        expect(context.requests).toHaveLength(0);
        expect(context.recordedProperties).toEqual([
            { connector_kind: "oomol", identity_source: "flag" },
        ]);
    });

    test("selects the config default when no flag or env override is set", async () => {
        const context = createSessionContext({
            auth: authFileWith(testAccount),
            settings: { identity: { team: "acme" } },
        });

        const session = await resolveConnectorSession({}, context);

        expect(session.identity).toEqual({
            name: "acme",
            id: null,
            source: "config",
            status: null,
        });
        expect(context.requests).toHaveLength(0);
    });

    test("validates the OO_TEAM_ID env team with the target's credential", async () => {
        const context = createSessionContext({
            auth: authFileWith(testAccount),
            env: { OO_TEAM_ID: "team-1" },
            fetcher: async () => new Response(JSON.stringify(teamByIdResponse)),
        });

        const session = await resolveConnectorSession({}, context);

        expect(session.identity).toEqual({
            name: "platform",
            id: "team-1",
            source: "env_id",
            status: "valid",
            envVar: "OO_TEAM_ID",
        });
        expect(context.requests).toHaveLength(1);
        // The lookup authenticates with the connector target's credential
        // against the account endpoint the target resolved.
        expect(context.requests[0]!.url).toBe(
            "https://relation-control.oomol.com/v1/teams/team-1",
        );
        expect(context.requests[0]!.authorization).toBe("api-secret-1");
        expect(context.recordedProperties).toEqual([
            { connector_kind: "oomol", identity_source: "env_id" },
        ]);
    });

    test("resolves the OO_TEAM_NAME env team through the memberships", async () => {
        const context = createSessionContext({
            auth: authFileWith(testAccount),
            env: { OO_TEAM_NAME: "acme" },
            fetcher: async () => new Response(JSON.stringify(teamsResponse)),
        });

        const session = await resolveConnectorSession({}, context);

        expect(session.identity).toEqual({
            name: "acme",
            id: "team-1",
            source: "env_name",
            status: "valid",
            envVar: "OO_TEAM_NAME",
        });
        expect(context.requests[0]!.url).toBe(
            "https://relation-control.oomol.com/v1/me/teams",
        );
    });
});

describe("resolveConnectorSession backend policy", () => {
    test("skips the env team lookup when resolveAgainstBackend is false", async () => {
        const context = createSessionContext({
            auth: authFileWith(testAccount),
            env: { OO_TEAM_ID: "team-1" },
        });

        const session = await resolveConnectorSession(
            { resolveAgainstBackend: false },
            context,
        );

        expect(session.identity).toEqual({
            name: null,
            id: "team-1",
            source: "env_id",
            status: null,
            envVar: "OO_TEAM_ID",
        });
        expect(context.requests).toHaveLength(0);
    });

    test("blocks the run when the backend refuses the env team", async () => {
        const context = createSessionContext({
            auth: authFileWith(testAccount),
            env: { OO_TEAM_ID: "team-9" },
            fetcher: async () => new Response("", { status: 404 }),
        });

        const error = await expectCliUserError(
            resolveConnectorSession({}, context),
        );

        expect(error.key).toBe("errors.team.envIdNotAccessible");
        expect(error.exitCode).toBe(1);
    });

    test("proceeds with the bare env team when the lookup cannot complete", async () => {
        const context = createSessionContext({
            auth: authFileWith(testAccount),
            env: { OO_TEAM_ID: "team-1" },
            fetcher: async () => {
                throw new Error("network down");
            },
        });

        const session = await resolveConnectorSession({}, context);

        expect(session.identity).toEqual({
            name: null,
            id: "team-1",
            source: "env_id",
            status: "request_failed",
            envVar: "OO_TEAM_ID",
        });
        expect(context.recordedProperties).toEqual([
            { connector_kind: "oomol", identity_source: "env_id" },
        ]);
    });
});

describe("teamIdentityOptions", () => {
    test("declares the shared flags with the caller's description keys", () => {
        expect(teamIdentityOptions({
            personal: "options.connectorRunPersonal",
            team: "options.connectorRunTeam",
        })).toEqual([
            {
                name: "team",
                longFlag: "--team",
                valueName: "team",
                descriptionKey: "options.connectorRunTeam",
            },
            {
                name: "personal",
                longFlag: "--personal",
                descriptionKey: "options.connectorRunPersonal",
            },
        ]);
    });
});

function authFileWith(account: typeof testAccount): AuthFile {
    return { auth: [account], id: account.id };
}

function createSessionContext(
    options: {
        auth?: AuthFile;
        connectorFile?: ConnectorFile;
        env?: Record<string, string | undefined>;
        fetcher?: Fetcher;
        settings?: AppSettings;
    } = {},
) {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const { recordedProperties, telemetry } = createRecordingTelemetry();
    const fetcher = options.fetcher ?? (async () => new Response("{}"));

    return {
        authStore: createAuthStore(options.auth ?? { auth: [], id: "" }),
        connectorStore: createInMemoryConnectorStore(options.connectorFile ?? {}),
        env: options.env ?? {},
        fetcher: (async (url, init) => {
            requests.push({
                url: url.toString(),
                authorization: new Headers(init?.headers).get("Authorization"),
            });

            return fetcher(url, init);
        }) satisfies Fetcher,
        logger: pino({ enabled: false }),
        settingsStore: createSettingsStore(options.settings ?? {}),
        telemetry,
        translator: createTranslator("en"),
        recordedProperties,
        requests,
    };
}
