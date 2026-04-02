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
});

function createAuthContext(authFile: AuthFile): CliExecutionContext {
    const stdout = createTextBuffer();
    const stderr = createTextBuffer();

    return {
        authStore: createAuthStore(authFile),
        cacheStore: createCacheStore(),
        currentLogFilePath: "",
        fetcher: async () => new Response(null),
        cwd: process.cwd(),
        env: {},
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
