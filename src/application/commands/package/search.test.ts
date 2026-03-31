import type {
    CacheOptions,
    CacheStore,
} from "../../contracts/cache.ts";
import type {
    CliCatalog,
    CliExecutionContext,
    Fetcher,
    InteractiveInput,
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
import { packageSearchCommand } from "./search.ts";

const searchHandler = packageSearchCommand.handler!;
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
const translator: Translator = {
    locale: "en",
    t: key => key,
    resolveLocale: () => "en",
};
const stdin: InteractiveInput = {
    on() {},
    off() {},
};

describe("packageSearchCommand", () => {
    test("reuses cached responses with the configured sqlite cache policy", async () => {
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
        const context = createSearchContext({
            cacheStore: createCacheStore(cache, cacheOptions),
            fetcher: async () => {
                fetchCount += 1;

                return new Response(JSON.stringify({
                    packages: [
                        {
                            displayName: "Image Tools",
                            name: "@oomol/image-tools",
                            version: "1.2.3",
                        },
                    ],
                }));
            },
        });

        await searchHandler({ text: "image processing" }, context);
        await searchHandler({ text: "image processing" }, context);

        expect(fetchCount).toBe(1);
        expect(cacheOptions).toHaveLength(2);
        expect(cacheOptions[0]).toEqual({
            id: "search.intent-response",
            defaultTtlMs: 30_000,
            maxEntries: 100,
        });
        expect(cacheOptions[1]).toEqual(cacheOptions[0]);
    });

    test("refreshes the cache when a cached response cannot be parsed", async () => {
        let cachedValue: string | null = "not-json";
        let deleteCount = 0;
        let fetchCount = 0;
        const cache = createCache<string>({
            delete() {
                deleteCount += 1;
                const hadValue = cachedValue !== null;

                cachedValue = null;

                return hadValue;
            },
            get() {
                return cachedValue;
            },
            set(_, value) {
                cachedValue = value;
            },
        });
        const context = createSearchContext({
            cacheStore: createCacheStore(cache),
            fetcher: async () => {
                fetchCount += 1;

                return new Response(JSON.stringify({
                    packages: [
                        {
                            displayName: "Image Tools",
                            name: "@oomol/image-tools",
                            version: "1.2.3",
                        },
                    ],
                }));
            },
        });

        await searchHandler({ text: "image processing" }, context);
        await searchHandler({ text: "image processing" }, context);

        expect(deleteCount).toBe(1);
        expect(fetchCount).toBe(1);
    });

    test("does not cache failed upstream responses", async () => {
        let fetchCount = 0;
        let setCount = 0;
        const cache = createCache<string>({
            delete() {
                return false;
            },
            get() {
                return null;
            },
            set() {
                setCount += 1;
            },
        });
        const context = createSearchContext({
            cacheStore: createCacheStore(cache),
            fetcher: async () => {
                fetchCount += 1;

                return new Response("gateway timeout", {
                    status: 504,
                });
            },
        });

        await expect(
            searchHandler({ text: "image processing" }, context),
        ).rejects.toMatchObject({
            key: "errors.search.requestFailed",
        });
        await expect(
            searchHandler({ text: "image processing" }, context),
        ).rejects.toMatchObject({
            key: "errors.search.requestFailed",
        });

        expect(fetchCount).toBe(2);
        expect(setCount).toBe(0);
    });
});

function createSearchContext(options: {
    cacheStore: CacheStore;
    fetcher: Fetcher;
}): CliExecutionContext {
    const stdout = createTextBuffer();
    const stderr = createTextBuffer();

    return {
        authStore: createAuthStore(activeAuthFile),
        cacheStore: options.cacheStore,
        currentLogFilePath: "",
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
