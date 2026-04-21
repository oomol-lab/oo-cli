import type {
    CacheOptions,
    CacheStore,
} from "../../contracts/cache.ts";
import type {
    CliCatalog,
    CliExecutionContext,
    Fetcher,
    InteractiveInput,
    SupportedLocale,
} from "../../contracts/cli.ts";
import type { Translator } from "../../contracts/translator.ts";
import type { AuthFile } from "../../schemas/auth.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createAuthStore,
    createCache,
    createCacheStore,
    createNoopFileDownloadSessionStore,
    createNoopFileUploadStore,
    createSettingsStore,
    createTextBuffer,
} from "../../../../__tests__/helpers.ts";
import { packageInfoCommand } from "./info.ts";

const packageInfoHandler = packageInfoCommand.handler!;
const activeAuthFile: AuthFile = {
    id: "user-1",
    auth: [
        {
            id: "user-1",
            name: "Alice",
            apiKey: "secret-1",
            endpoint: "oomol.com",
        },
    ],
};
const emptyCatalog: CliCatalog = {
    name: "oo",
    descriptionKey: "catalog.description",
    globalOptions: [],
    commands: [],
};
const stdin: InteractiveInput = {
    on() {},
    off() {},
};

describe("packageInfoCommand", () => {
    test("reuses cached explicit package versions with the configured sqlite cache policy", async () => {
        const cacheOptions: CacheOptions[] = [];
        const cacheValues = new Map<string, string>();
        let fetchCount = 0;
        const cache = createCache<string>({
            delete(key) {
                return cacheValues.delete(key);
            },
            get(key) {
                return cacheValues.get(key) ?? null;
            },
            set(key, value) {
                cacheValues.set(key, value);
            },
        });
        const context = createPackageInfoContext({
            cacheStore: createCacheStore(cache, cacheOptions),
            fetcher: async () => {
                fetchCount += 1;

                return new Response(JSON.stringify({
                    packageName: "pdf",
                    packageVersion: "1.0.0",
                    title: "PDF Toolkit",
                    description: "Inspect PDF files",
                    blocks: [],
                }));
            },
        });

        await packageInfoHandler({ packageSpecifier: "pdf@1.0.0" }, context);
        await packageInfoHandler({ packageSpecifier: "pdf@1.0.0" }, context);

        expect(fetchCount).toBe(1);
        expect(cacheOptions).toHaveLength(2);
        expect(cacheOptions[0]).toEqual({
            id: "package.info.v5",
            defaultTtlMs: 2_592_000_000,
            maxEntries: 300,
        });
        expect(cacheOptions[1]).toEqual(cacheOptions[0]);
    });

    test("does not reuse cached package info across request languages", async () => {
        const cacheValues = new Map<string, string>();
        let fetchCount = 0;
        const cache = createCache<string>({
            delete(key) {
                return cacheValues.delete(key);
            },
            get(key) {
                return cacheValues.get(key) ?? null;
            },
            set(key, value) {
                cacheValues.set(key, value);
            },
        });
        const cacheStore = createCacheStore(cache);
        const englishContext = createPackageInfoContext({
            cacheStore,
            fetcher: async () => {
                fetchCount += 1;

                return new Response(JSON.stringify({
                    packageName: "pdf",
                    packageVersion: "1.0.0",
                    title: "PDF Toolkit",
                    description: "Inspect PDF files",
                    blocks: [],
                }));
            },
            locale: "en",
        });
        const chineseContext = createPackageInfoContext({
            cacheStore,
            fetcher: async () => {
                fetchCount += 1;

                return new Response(JSON.stringify({
                    packageName: "pdf",
                    packageVersion: "1.0.0",
                    title: "PDF Toolkit",
                    description: "Inspect PDF files",
                    blocks: [],
                }));
            },
            locale: "zh",
        });

        await packageInfoHandler({ packageSpecifier: "pdf@1.0.0" }, englishContext);
        await packageInfoHandler({ packageSpecifier: "pdf@1.0.0" }, chineseContext);

        expect(fetchCount).toBe(2);
    });
});

function createPackageInfoContext(options: {
    cacheStore: CacheStore;
    fetcher: Fetcher;
    locale?: SupportedLocale;
}): CliExecutionContext {
    const stdout = createTextBuffer();
    const stderr = createTextBuffer();
    const locale = options.locale ?? "en";
    const translator: Translator = {
        locale,
        t: key => key,
        resolveLocale: () => locale,
    };

    return {
        authStore: createAuthStore(activeAuthFile),
        cacheStore: options.cacheStore,
        currentLogFilePath: "",
        execPath: process.execPath,
        fetcher: options.fetcher,
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
