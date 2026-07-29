import type { AuthStore } from "../contracts/auth-store.ts";
import type { CliExecutionContext, CliTelemetryPropertyValue } from "../contracts/cli.ts";
import type { AuthFile } from "../schemas/auth.ts";
import type { AppSettings } from "../schemas/settings.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createAuthStore,
    createRecordingTelemetry,
    createSettingsStore,
} from "../../../__tests__/helpers.ts";
import {
    clearDefaultTeam,
    migrateLegacyDefaultTeam,
    readDefaultTeam,
    writeDefaultTeam,
} from "./default-team.ts";

const account = {
    apiKey: "persisted-key",
    endpoint: "oomol.com",
    id: "user-1",
    name: "Alice",
};

describe("readDefaultTeam", () => {
    test("returns the account default with both dimensions", async () => {
        const { context } = createDefaultTeamContext({
            authFile: {
                auth: [{ ...account, team: "acme", teamId: "team-1" }],
                id: "user-1",
            },
        });

        await expect(readDefaultTeam(context)).resolves.toEqual({
            id: "team-1",
            name: "acme",
        });
    });

    test("reports a missing team id as null", async () => {
        const { context } = createDefaultTeamContext({
            authFile: { auth: [{ ...account, team: "acme" }], id: "user-1" },
        });

        await expect(readDefaultTeam(context)).resolves.toEqual({
            id: null,
            name: "acme",
        });
    });

    test("falls back to the legacy setting when the account has no default", async () => {
        const { context } = createDefaultTeamContext({
            authFile: { auth: [account], id: "user-1" },
            settings: { identity: { team: "legacy-team" } },
        });

        await expect(readDefaultTeam(context)).resolves.toEqual({
            id: null,
            name: "legacy-team",
        });
    });

    test("prefers the account default over the legacy setting", async () => {
        const { context } = createDefaultTeamContext({
            authFile: { auth: [{ ...account, team: "acme" }], id: "user-1" },
            settings: { identity: { team: "legacy-team" } },
        });

        await expect(readDefaultTeam(context)).resolves.toMatchObject({
            name: "acme",
        });
    });

    test("still honours the legacy setting when auth.toml cannot be read", async () => {
        const { context } = createDefaultTeamContext({
            authStore: createUnreadableAuthStore(),
            settings: { identity: { team: "legacy-team" } },
        });

        await expect(readDefaultTeam(context)).resolves.toEqual({
            id: null,
            name: "legacy-team",
        });
    });

    test("resolves to personal when nothing is stored", async () => {
        const { context } = createDefaultTeamContext({
            authFile: { auth: [account], id: "user-1" },
        });

        await expect(readDefaultTeam(context)).resolves.toBeUndefined();
    });

    test("resolves to personal under OO_API_KEY without touching any store", async () => {
        const { context } = createDefaultTeamContext({
            authStore: createThrowingAuthStore(),
            env: { OO_API_KEY: "env-key" },
            settings: { identity: { team: "legacy-team" } },
        });

        await expect(readDefaultTeam(context)).resolves.toBeUndefined();
    });
});

describe("writeDefaultTeam", () => {
    test("stores the default on the active account and drops the legacy value", async () => {
        const { context, readAuthFile, readSettings } = createDefaultTeamContext({
            authFile: { auth: [account], id: "user-1" },
            settings: { identity: { team: "legacy-team" }, lang: "en" },
        });

        await expect(writeDefaultTeam(context, { id: "team-1", name: "acme" }))
            .resolves
            .toBe(true);

        expect((await readAuthFile()).auth[0]).toMatchObject({
            team: "acme",
            teamId: "team-1",
        });
        expect(await readSettings()).toEqual({ lang: "en" });
    });

    test("reports that nothing was stored when no account is active", async () => {
        const { context } = createDefaultTeamContext({
            authFile: { auth: [], id: "" },
        });

        await expect(writeDefaultTeam(context, { id: null, name: "acme" }))
            .resolves
            .toBe(false);
    });

    test("does not rewrite the file when the default is already stored", async () => {
        const { context } = createDefaultTeamContext({
            authStore: createUnwritableAuthStore({
                auth: [{ ...account, team: "acme", teamId: "team-1" }],
                id: "user-1",
            }),
        });

        // Re-selecting the same team and backfilling an id that is already
        // there both land here; the unwritable store proves neither writes.
        await expect(writeDefaultTeam(context, { id: "team-1", name: "acme" }))
            .resolves
            .toBe(true);
    });
});

describe("clearDefaultTeam", () => {
    test("clears the account default", async () => {
        const { context, readAuthFile } = createDefaultTeamContext({
            authFile: {
                auth: [{ ...account, team: "acme", teamId: "team-1" }],
                id: "user-1",
            },
        });

        await expect(clearDefaultTeam(context)).resolves.toBe(true);
        expect((await readAuthFile()).auth[0]).toEqual(account);
    });

    test("clears a legacy value that no account could hold", async () => {
        const { context, readSettings } = createDefaultTeamContext({
            authFile: { auth: [], id: "" },
            settings: { identity: { team: "legacy-team" } },
        });

        await expect(clearDefaultTeam(context)).resolves.toBe(true);
        expect(await readSettings()).toEqual({});
    });

    test("reports nothing to clear for an account already on the personal identity", async () => {
        const { context } = createDefaultTeamContext({
            authFile: { auth: [account], id: "user-1" },
        });

        await expect(clearDefaultTeam(context)).resolves.toBe(false);
    });

    test("still clears the legacy value when auth.toml cannot be read", async () => {
        const { context, readSettings } = createDefaultTeamContext({
            authStore: createUnreadableAuthStore(),
            settings: { identity: { team: "legacy-team" } },
        });

        // readDefaultTeam keeps honouring the legacy value in this state, so
        // clearing has to reach it too — otherwise the one default still in
        // effect is the one that cannot be cleared.
        await expect(clearDefaultTeam(context)).resolves.toBe(true);
        expect(await readSettings()).toEqual({});
    });

    test("reports the legacy removal as a migration", async () => {
        const { context, recordedProperties } = createDefaultTeamContext({
            authFile: { auth: [account], id: "user-1" },
            settings: { identity: { team: "legacy-team" } },
        });

        await clearDefaultTeam(context);

        expect(recordedProperties).toEqual([{ team_default_migrated: true }]);
    });
});

describe("migrateLegacyDefaultTeam", () => {
    test("moves the legacy value onto the active account and deletes it", async () => {
        const {
            context,
            readAuthFile,
            readSettings,
            recordedProperties,
        } = createDefaultTeamContext({
            authFile: { auth: [account], id: "user-1" },
            settings: { identity: { team: "legacy-team" }, lang: "en" },
        });

        await runMigration(context);

        expect((await readAuthFile()).auth[0]).toMatchObject({ team: "legacy-team" });
        expect((await readAuthFile()).auth[0]?.teamId).toBeUndefined();
        expect(await readSettings()).toEqual({ lang: "en" });
        expect(recordedProperties).toEqual([{ team_default_migrated: true }]);
    });

    test("only migrates the account the file points at", async () => {
        const { context, readAuthFile } = createDefaultTeamContext({
            authFile: {
                auth: [account, { ...account, id: "user-2", name: "Bob" }],
                id: "user-1",
            },
            settings: { identity: { team: "legacy-team" } },
        });

        await runMigration(context);

        expect((await readAuthFile()).auth[0]).toMatchObject({ team: "legacy-team" });
        expect((await readAuthFile()).auth[1]?.team).toBeUndefined();
    });

    test("keeps an account default and deletes only the stale legacy value", async () => {
        const { context, readAuthFile, readSettings } = createDefaultTeamContext({
            authFile: {
                auth: [{ ...account, team: "acme", teamId: "team-1" }],
                id: "user-1",
            },
            settings: { identity: { team: "legacy-team" } },
        });

        await runMigration(context);

        expect((await readAuthFile()).auth[0]).toMatchObject({
            team: "acme",
            teamId: "team-1",
        });
        expect(await readSettings()).toEqual({});
    });

    test("leaves the legacy value in place when no account can hold it", async () => {
        const { context, readSettings, recordedProperties } = createDefaultTeamContext({
            authFile: { auth: [], id: "" },
            settings: { identity: { team: "legacy-team" } },
        });

        await runMigration(context);

        expect(await readSettings()).toEqual({ identity: { team: "legacy-team" } });
        expect(recordedProperties).toEqual([]);
    });

    test("does nothing at all under OO_API_KEY", async () => {
        const { context, readSettings } = createDefaultTeamContext({
            authStore: createThrowingAuthStore(),
            env: { OO_API_KEY: "env-key" },
            settings: { identity: { team: "legacy-team" } },
        });

        await runMigration(context);

        expect(await readSettings()).toEqual({ identity: { team: "legacy-team" } });
    });

    test("swallows a failing auth write and keeps the legacy value", async () => {
        const { context, readSettings } = createDefaultTeamContext({
            authStore: createUnwritableAuthStore({
                auth: [account],
                id: "user-1",
            }),
            settings: { identity: { team: "legacy-team" } },
        });

        await expect(runMigration(context)).resolves.toBeUndefined();
        expect(await readSettings()).toEqual({ identity: { team: "legacy-team" } });
    });

    test("records nothing when there is no legacy value to migrate", async () => {
        const { context, recordedProperties } = createDefaultTeamContext({
            authFile: { auth: [account], id: "user-1" },
        });

        await runMigration(context);

        expect(recordedProperties).toEqual([]);
    });
});

// Mirrors the bootstrap, which hands the migration the settings it has
// already read for its own reasons.
async function runMigration(context: DefaultTeamContext): Promise<void> {
    await migrateLegacyDefaultTeam(context, await context.settingsStore.read());
}

type DefaultTeamContext = Pick<
    CliExecutionContext,
    "authStore" | "env" | "logger" | "settingsStore" | "telemetry"
>;

function createDefaultTeamContext(
    overrides: {
        authFile?: AuthFile;
        authStore?: AuthStore;
        env?: Record<string, string | undefined>;
        settings?: AppSettings;
    } = {},
): {
    context: DefaultTeamContext;
    readAuthFile: () => Promise<AuthFile>;
    readSettings: () => Promise<AppSettings>;
    recordedProperties: Record<string, CliTelemetryPropertyValue>[];
} {
    const authStore = overrides.authStore
        ?? createAuthStore(overrides.authFile ?? { auth: [], id: "" });
    const settingsStore = createSettingsStore(overrides.settings ?? {});
    const { recordedProperties, telemetry } = createRecordingTelemetry();

    return {
        context: {
            authStore,
            env: overrides.env ?? {},
            logger: pino({ enabled: false }),
            settingsStore,
            telemetry,
        },
        readAuthFile: async () => (await authStore.readTolerantState()).authFile,
        readSettings: () => settingsStore.read(),
        recordedProperties,
    };
}

function createThrowingAuthStore(): AuthStore {
    const fail = (): never => {
        throw new Error("auth.toml must not be accessed when OO_API_KEY is set");
    };

    return {
        getFilePath: () => "/should-not-be-read/auth.toml",
        read: async () => fail(),
        readTolerantState: async () => fail(),
        write: async () => fail(),
        update: async () => fail(),
    };
}

// Mirrors the file store on a corrupt auth.toml: the tolerant read reports an
// empty file, and the strict read fails.
function createUnreadableAuthStore(): AuthStore {
    return {
        getFilePath: () => "/unreadable/auth.toml",
        read: async () => {
            throw new Error("auth.toml is corrupt");
        },
        readTolerantState: async () => ({
            authFile: { auth: [], id: "" },
            fileState: "corrupt",
        }),
        write: async () => {
            throw new Error("auth.toml is corrupt");
        },
        update: async () => {
            throw new Error("auth.toml is corrupt");
        },
    };
}

// A readable auth.toml on a filesystem that refuses the write.
function createUnwritableAuthStore(authFile: AuthFile): AuthStore {
    return {
        getFilePath: () => "/read-only/auth.toml",
        read: async () => authFile,
        readTolerantState: async () => ({ authFile, fileState: "ok" }),
        write: async () => {
            throw new Error("auth.toml is not writable");
        },
        update: async () => {
            throw new Error("auth.toml is not writable");
        },
    };
}
