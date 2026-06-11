import type { AuthStore } from "../../contracts/auth-store.ts";
import type {
    CliCatalog,
    CliExecutionContext,
    InteractiveInput,
} from "../../contracts/cli.ts";
import type { Translator } from "../../contracts/translator.ts";
import type { AuthFile } from "../../schemas/auth.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createAuthStore,
    createCacheStore,
    createNoopFileDownloadSessionStore,
    createNoopFileUploadStore,
    createSettingsStore,
    createTextBuffer,
} from "../../../../__tests__/helpers.ts";
import { requireCurrentAccount } from "./auth-utils.ts";

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

describe("requireCurrentAccount", () => {
    test("uses the shared auth-required key when no account is active", async () => {
        const context = createAuthContext({
            auth: [],
            id: "",
        });

        await expect(requireCurrentAccount(context)).rejects.toMatchObject({
            exitCode: 1,
            key: "errors.auth.required",
        });
    });

    test("uses the shared missing-account key when the active id is stale", async () => {
        const context = createAuthContext({
            auth: [],
            id: "user-1",
        });

        await expect(requireCurrentAccount(context)).rejects.toMatchObject({
            exitCode: 1,
            key: "auth.account.activeAccountMissing",
        });
    });

    test("returns the current account when it exists", async () => {
        const account = {
            id: "user-1",
            name: "Test User",
            apiKey: "test-key",
            endpoint: "api.example.com",
        };
        const context = createAuthContext({
            auth: [account],
            id: "user-1",
        });

        await expect(requireCurrentAccount(context)).resolves.toEqual(account);
    });

    test("resolves the OO_API_KEY override without reading auth.toml", async () => {
        const context = createAuthContext(
            { auth: [], id: "" },
            {
                authStore: createThrowingAuthStore(),
                env: { OO_API_KEY: "env-key", OO_ENDPOINT: "oomol.dev" },
            },
        );

        await expect(requireCurrentAccount(context)).resolves.toEqual({
            apiKey: "env-key",
            endpoint: "oomol.dev",
            id: "oo-env-override",
            name: "Environment (OO_API_KEY)",
        });
    });

    test("prefers OO_API_KEY over a persisted active account", async () => {
        const context = createAuthContext(
            {
                auth: [{
                    id: "user-1",
                    name: "Test User",
                    apiKey: "persisted-key",
                    endpoint: "oomol.com",
                }],
                id: "user-1",
            },
            { env: { OO_API_KEY: "env-key" } },
        );

        const resolved = await requireCurrentAccount(context);

        expect(resolved.apiKey).toBe("env-key");
        expect(resolved.id).toBe("oo-env-override");
        // OO_ENDPOINT is unset, so the override falls back to the public default.
        expect(resolved.endpoint).toBe("oomol.com");
    });

    test("redirects a persisted account endpoint with a bare OO_ENDPOINT", async () => {
        const account = {
            id: "user-1",
            name: "Test User",
            apiKey: "persisted-key",
            endpoint: "oomol.com",
        };
        const context = createAuthContext(
            { auth: [account], id: "user-1" },
            { env: { OO_ENDPOINT: "oomol.dev" } },
        );

        await expect(requireCurrentAccount(context)).resolves.toEqual({
            ...account,
            endpoint: "oomol.dev",
        });
    });
});

function createThrowingAuthStore(): AuthStore {
    const fail = (): never => {
        throw new Error("auth.toml must not be accessed when OO_API_KEY is set");
    };

    return {
        getFilePath: () => "/should-not-be-read/auth.toml",
        read: async () => fail(),
        write: async () => fail(),
        update: async () => fail(),
    };
}

function createAuthContext(
    authFile: AuthFile,
    overrides: {
        authStore?: AuthStore;
        env?: Record<string, string | undefined>;
    } = {},
): CliExecutionContext {
    const stdout = createTextBuffer();
    const stderr = createTextBuffer();

    return {
        authStore: overrides.authStore ?? createAuthStore(authFile),
        cacheStore: createCacheStore(),
        currentLogFilePath: "",
        execPath: process.execPath,
        fetcher: async () => new Response(null),
        cwd: process.cwd(),
        env: overrides.env ?? {},
        fileDownloadSessionStore: createNoopFileDownloadSessionStore(),
        fileUploadStore: createNoopFileUploadStore(),
        stdin,
        logger: pino({
            enabled: false,
        }),
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
    };
}
