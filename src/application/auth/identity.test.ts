import type { AuthStore } from "../contracts/auth-store.ts";
import type {
    CliCatalog,
    CliExecutionContext,
    CliTelemetryPropertyValue,
    InteractiveInput,
} from "../contracts/cli.ts";
import type { ConnectorStore } from "../contracts/connector-store.ts";
import type { Translator } from "../contracts/translator.ts";
import type { AuthFile } from "../schemas/auth.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createAuthStore,
    createCacheStore,
    createInMemoryConnectorStore,
    createNoopFileDownloadSessionStore,
    createNoopFileUploadStore,
    createSettingsStore,
    createTextBuffer,
} from "../../../__tests__/helpers.ts";
import {
    reportOverriddenWrite,
    requireIdentity,
    resolveIdentity,
    resolveLoginEndpoint,
} from "./identity.ts";

const activeAccount = {
    apiKey: "persisted-key",
    endpoint: "custom.oomol.test",
    id: "user-1",
    name: "Alice",
};

describe("resolveIdentity", () => {
    test("resolves the OO_API_KEY override without touching the auth store", async () => {
        const { context } = createIdentityContext({
            authStore: createThrowingAuthStore(),
            env: { OO_API_KEY: "env-key", OO_ENDPOINT: "oomol.dev" },
        });

        await expect(resolveIdentity(context)).resolves.toEqual({
            account: {
                apiKey: "env-key",
                endpoint: "oomol.dev",
                id: "oo-env-override",
                name: "Environment (OO_API_KEY)",
            },
            endpoint: "oomol.dev",
            fileState: "unread",
            overriddenBy: "OO_API_KEY",
            source: "env",
        });
    });

    test("trims whitespace from OO_API_KEY and OO_ENDPOINT", async () => {
        const { context } = createIdentityContext({
            env: { OO_API_KEY: "  env-key  ", OO_ENDPOINT: "  oomol.dev " },
        });

        const identity = await resolveIdentity(context);

        expect(identity.account?.apiKey).toBe("env-key");
        expect(identity.endpoint).toBe("oomol.dev");
    });

    test("treats a blank OO_API_KEY as unset", async () => {
        const { context } = createIdentityContext({
            authFile: { auth: [activeAccount], id: "user-1" },
            env: { OO_API_KEY: "   " },
        });

        const identity = await resolveIdentity(context);

        expect(identity.source).toBe("file");
        expect(identity.account).toEqual(activeAccount);
    });

    test("resolves the active account with its own endpoint", async () => {
        const { context } = createIdentityContext({
            authFile: { auth: [activeAccount], id: "user-1" },
        });

        await expect(resolveIdentity(context)).resolves.toEqual({
            account: activeAccount,
            endpoint: "custom.oomol.test",
            fileState: "ok",
            source: "file",
        });
    });

    test("redirects the active account endpoint with a bare OO_ENDPOINT", async () => {
        const { context } = createIdentityContext({
            authFile: { auth: [activeAccount], id: "user-1" },
            env: { OO_ENDPOINT: "oomol.dev" },
        });

        const identity = await resolveIdentity(context);

        expect(identity.account).toEqual({
            ...activeAccount,
            endpoint: "oomol.dev",
        });
        expect(identity.endpoint).toBe("oomol.dev");
    });

    test.each<{ case: string; authFile: AuthFile }>([
        { case: "no account is saved", authFile: { auth: [], id: "" } },
        { case: "the active id is stale", authFile: { auth: [], id: "user-1" } },
    ])("resolves to no identity when $case", async ({ authFile }) => {
        const { context } = createIdentityContext({ authFile });

        await expect(resolveIdentity(context)).resolves.toEqual({
            account: undefined,
            endpoint: "oomol.com",
            fileState: "ok",
            source: "none",
        });
    });

    test("uses OO_ENDPOINT for the endpoint when no account is available", async () => {
        const { context } = createIdentityContext({
            env: { OO_ENDPOINT: "oomol.dev" },
        });

        const identity = await resolveIdentity(context);

        expect(identity.source).toBe("none");
        expect(identity.endpoint).toBe("oomol.dev");
    });

    test("ignores the removed legacy OOMOL_ENDPOINT variable", async () => {
        const { context } = createIdentityContext({
            env: { OOMOL_ENDPOINT: "legacy.oomol.test" },
        });

        const identity = await resolveIdentity(context);

        expect(identity.endpoint).toBe("oomol.com");
    });

    test.each<{ fileState: "corrupt" | "missing" }>([
        { fileState: "missing" },
        { fileState: "corrupt" },
    ])("reports fileState $fileState from the tolerant read", async ({ fileState }) => {
        const { context } = createIdentityContext({
            authStore: createUnreadableAuthStore(fileState),
        });

        await expect(resolveIdentity(context)).resolves.toEqual({
            account: undefined,
            endpoint: "oomol.com",
            fileState,
            source: "none",
        });
    });
});

describe("requireIdentity", () => {
    test("resolves the OO_API_KEY override without touching the auth store", async () => {
        const { context } = createIdentityContext({
            authStore: createThrowingAuthStore(),
            env: { OO_API_KEY: "env-key" },
        });

        const identity = await requireIdentity(context);

        expect(identity.source).toBe("env");
        expect(identity.overriddenBy).toBe("OO_API_KEY");
        // OO_ENDPOINT is unset, so the override falls back to the public default.
        expect(identity.account.endpoint).toBe("oomol.com");
    });

    test("prefers OO_API_KEY over a persisted active account", async () => {
        const { context } = createIdentityContext({
            authFile: { auth: [activeAccount], id: "user-1" },
            env: { OO_API_KEY: "env-key" },
        });

        const identity = await requireIdentity(context);

        expect(identity.account.apiKey).toBe("env-key");
        expect(identity.account.id).toBe("oo-env-override");
    });

    test("returns the active account with a bare OO_ENDPOINT applied", async () => {
        const { context } = createIdentityContext({
            authFile: { auth: [activeAccount], id: "user-1" },
            env: { OO_ENDPOINT: "oomol.dev" },
        });

        await expect(requireIdentity(context)).resolves.toEqual({
            account: { ...activeAccount, endpoint: "oomol.dev" },
            endpoint: "oomol.dev",
            fileState: "ok",
            source: "file",
        });
    });

    test("uses the shared auth-required key when no account is active", async () => {
        const { context } = createIdentityContext();

        await expect(requireIdentity(context)).rejects.toMatchObject({
            exitCode: 1,
            key: "errors.auth.required",
        });
    });

    test("uses the missing-account key when the active id is stale", async () => {
        const { context } = createIdentityContext({
            authFile: { auth: [], id: "user-1" },
        });

        await expect(requireIdentity(context)).rejects.toMatchObject({
            exitCode: 1,
            key: "auth.account.activeAccountMissing",
        });
    });

    test("uses the connector-only auth key when only connector.toml is configured", async () => {
        const { context } = createIdentityContext({
            connectorStore: createInMemoryConnectorStore({
                selfHosted: { url: "http://localhost:3000" },
            }),
        });

        await expect(requireIdentity(context)).rejects.toMatchObject({
            exitCode: 1,
            key: "errors.auth.requiredConnectorOnly",
        });
    });

    test("uses the connector-only auth key when OO_CONNECTOR_URL is set", async () => {
        const { context } = createIdentityContext({
            env: { OO_CONNECTOR_URL: "http://localhost:3000" },
        });

        await expect(requireIdentity(context)).rejects.toMatchObject({
            exitCode: 1,
            key: "errors.auth.requiredConnectorOnly",
        });
    });

    test("keeps the missing-account key for a stale id even with a self-hosted connector", async () => {
        const { context } = createIdentityContext({
            authFile: { auth: [], id: "user-1" },
            connectorStore: createInMemoryConnectorStore({
                selfHosted: { url: "http://localhost:3000" },
            }),
        });

        await expect(requireIdentity(context)).rejects.toMatchObject({
            exitCode: 1,
            key: "auth.account.activeAccountMissing",
        });
    });

    test("falls back to the shared auth-required key when the connector store read fails", async () => {
        const { context } = createIdentityContext({
            connectorStore: createThrowingConnectorStore(),
        });

        await expect(requireIdentity(context)).rejects.toMatchObject({
            exitCode: 1,
            key: "errors.auth.required",
        });
    });
});

describe("resolveLoginEndpoint", () => {
    test.each<{
        case: string;
        env: Record<string, string | undefined>;
        expected: string;
    }>([
        { case: "prefers OO_ENDPOINT", env: { OO_ENDPOINT: "oomol.dev" }, expected: "oomol.dev" },
        { case: "trims OO_ENDPOINT", env: { OO_ENDPOINT: "  oomol.dev " }, expected: "oomol.dev" },
        { case: "defaults to the public endpoint", env: {}, expected: "oomol.com" },
        { case: "treats a blank OO_ENDPOINT as unset", env: { OO_ENDPOINT: "  " }, expected: "oomol.com" },
        {
            case: "ignores the removed legacy OOMOL_ENDPOINT variable",
            env: { OOMOL_ENDPOINT: "legacy.oomol.test" },
            expected: "oomol.com",
        },
        {
            // The saved account's endpoint is deliberately not consulted:
            // logging in starts a new session and must not be steered by
            // where an old account points.
            case: "never consults the active account",
            env: {},
            expected: "oomol.com",
        },
    ])("$case", ({ env, expected }) => {
        expect(resolveLoginEndpoint(env)).toBe(expected);
    });
});

describe("reportOverriddenWrite", () => {
    test("emits telemetry, the warning block, and the unset hint", () => {
        const { context, readStdout, recordedProperties } = createIdentityContext({
            env: { OO_API_KEY: "env-key" },
        });

        reportOverriddenWrite(context, {
            extraTelemetry: { has_user_filter: true },
            summaryKey: "auth.switch.envOverrideNoop",
        });

        expect(recordedProperties).toEqual([
            { credential_source: "env", has_user_filter: true },
        ]);

        const output = readStdout();

        expect(output).toContain("auth.switch.envOverrideNoop");
        expect(output).toContain("auth.envOverride.unsetHint");
    });

    test("tolerates a context without telemetry", () => {
        const { context, readStdout } = createIdentityContext({
            env: { OO_API_KEY: "env-key" },
            telemetry: false,
        });

        reportOverriddenWrite(context, {
            summaryKey: "auth.logout.envOverrideNoop",
        });

        expect(readStdout()).toContain("auth.logout.envOverrideNoop");
    });
});

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

// Simulates a missing or unreadable auth.toml as the file store reports it:
// the tolerant read falls back to the empty file and only fileState says why.
function createUnreadableAuthStore(
    fileState: "corrupt" | "missing",
): AuthStore {
    const emptyAuthFile: AuthFile = { auth: [], id: "" };

    return {
        getFilePath: () => "/unreadable/auth.toml",
        read: async () => {
            throw new Error("strict read must not be used by tolerant resolution");
        },
        readTolerantState: async () => ({
            authFile: emptyAuthFile,
            fileState,
        }),
        write: async () => {
            throw new Error("write is not expected");
        },
        update: async () => {
            throw new Error("update is not expected");
        },
    };
}

function createThrowingConnectorStore(): ConnectorStore {
    const fail = (): never => {
        throw new Error("connector.toml is corrupted");
    };

    return {
        getFilePath: () => "<broken-connector-store>",
        read: async () => fail(),
        write: async () => fail(),
        update: async () => fail(),
    };
}

function createIdentityContext(
    overrides: {
        authFile?: AuthFile;
        authStore?: AuthStore;
        connectorStore?: ConnectorStore;
        env?: Record<string, string | undefined>;
        telemetry?: false;
    } = {},
): {
    context: CliExecutionContext;
    readStdout: () => string;
    recordedProperties: Record<string, CliTelemetryPropertyValue>[];
} {
    const emptyCatalog: CliCatalog = {
        name: "oo",
        descriptionKey: "catalog.description",
        globalOptions: [],
        commands: [],
    };
    const translator: Translator = {
        locale: "en",
        t: key => key,
        resolveLocale: () => "en",
    };
    const stdin: InteractiveInput = {
        on() {},
        off() {},
    };
    const stdout = createTextBuffer();
    const stderr = createTextBuffer();
    const recordedProperties: Record<string, CliTelemetryPropertyValue>[] = [];

    const context: CliExecutionContext = {
        authStore: overrides.authStore
            ?? createAuthStore(overrides.authFile ?? { auth: [], id: "" }),
        cacheStore: createCacheStore(),
        connectorStore: overrides.connectorStore ?? createInMemoryConnectorStore(),
        currentLogFilePath: "",
        execPath: process.execPath,
        fetcher: async () => new Response(null),
        cwd: process.cwd(),
        env: overrides.env ?? {},
        fileDownloadSessionStore: createNoopFileDownloadSessionStore(),
        fileUploadStore: createNoopFileUploadStore(),
        stdin,
        logger: pino({ enabled: false }),
        packageName: "@oomol-lab/oo-cli",
        settingsStore: createSettingsStore({}),
        stdout: stdout.writer,
        stderr: stderr.writer,
        translator,
        completionRenderer: {
            render: () => "",
        },
        catalog: emptyCatalog,
        version: "0.1.0",
        ...(overrides.telemetry === false
            ? {}
            : {
                    telemetry: {
                        directoryPath: "",
                        recordProperties: (properties) => {
                            recordedProperties.push(properties);
                        },
                        suppressCurrentInvocation: () => {},
                    },
                }),
    };

    return {
        context,
        readStdout: () => stdout.read(),
        recordedProperties,
    };
}
