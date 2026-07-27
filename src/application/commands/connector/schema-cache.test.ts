import type { Logger } from "pino";
import type { Cache, CacheOptions } from "../../contracts/cache.ts";
import type { AppSettings } from "../../schemas/settings.ts";

import type { ConnectorSchemaCacheScope } from "./schema-cache.ts";
import type {
    ConnectorActionMetadata,
    ConnectorActionSearchResult,
} from "./shared.ts";
import { mkdir, rm } from "node:fs/promises";

import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import pino from "pino";
import {
    createCacheStore,
    createConnectorActionFixture,
    createConnectorTargetFixture,
    createLogCapture,
    createMemoryCache,
    createTemporaryDirectory,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { CliUserError } from "../../contracts/cli.ts";

import {
    clearConnectorActionSchemaCache,
    createConnectorSchemaCacheScope,
    invalidateConnectorActionSchemaOnNotFound,
    loadConnectorActionSchema,
    warmConnectorActionSchemas,
} from "./schema-cache.ts";

// The scope every fixture-backed test shares; variant scopes are built
// inline where a test exists to prove entry isolation.
const userScope = createConnectorSchemaCacheScope({
    accountId: "user-1",
    endpoint: "oomol.com",
});

describe("connector schema cache", () => {
    test("loadConnectorActionSchema caches fetched metadata and reuses it without a second fetch", async () => {
        const cache = createMemoryCache();
        let fetchCount = 0;

        const fetched = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
                fetcher: async () => {
                    fetchCount += 1;

                    return createMetadataResponse({
                        description: "Fetched schema.",
                    });
                },
            }),
        );

        expect(fetched).toMatchObject({
            description: "Fetched schema.",
        });
        expect(fetchCount).toBe(1);

        // The second load must be served from the cache: the default context
        // fetcher rejects every request.
        const cached = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
            }),
        );

        expect(cached).toMatchObject({
            description: "Fetched schema.",
        });
    });

    test("loadConnectorActionSchema refetches lifecycle-less cache entries when the async lifecycle is required", async () => {
        const cache = createMemoryCache();

        // Warm from a search result: warmed entries never carry an async
        // lifecycle, which is exactly what this test needs.
        await warmConnectorActionSchemas(
            [createSearchResultFixture({
                description: "Search-seeded schema.",
            })],
            userScope,
            createCacheContext({
                cache,
            }),
        );

        const schema = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                requireAsyncLifecycle: true,
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
                fetcher: async () => createMetadataResponse({
                    asyncLifecycle: {
                        role: "submit",
                        resultAction: "get_send_result",
                        handle: {
                            inputField: "sessionID",
                            outputField: "sessionId",
                        },
                    },
                    description: "Fresh schema.",
                }),
            }),
        );

        expect(schema).toMatchObject({
            asyncLifecycle: {
                role: "submit",
            },
            description: "Fresh schema.",
        });

        // The refetched metadata replaced the lifecycle-less entry.
        const cached = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                requireAsyncLifecycle: true,
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
            }),
        );

        expect(cached).toMatchObject({
            description: "Fresh schema.",
        });
    });

    test("loadConnectorActionSchema reuses cached entries with an async lifecycle when it is required", async () => {
        const cache = createMemoryCache();

        await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "openai_image_async_submit",
                serviceName: "fusion-api",
            },
            createCacheContext({
                cache,
                fetcher: async () => createMetadataResponse({
                    asyncLifecycle: {
                        role: "submit",
                        resultAction: "openai_image_async_result",
                        handle: {
                            inputField: "sessionID",
                            outputField: "sessionId",
                        },
                    },
                    name: "openai_image_async_submit",
                    service: "fusion-api",
                }),
            }),
        );

        const schema = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "openai_image_async_submit",
                requireAsyncLifecycle: true,
                serviceName: "fusion-api",
            },
            createCacheContext({
                cache,
            }),
        );

        expect(schema).toMatchObject({
            asyncLifecycle: {
                role: "submit",
            },
            name: "openai_image_async_submit",
        });
    });

    test("loadConnectorActionSchema refreshes invalid cache content from metadata", async () => {
        const cache = createMemoryCache();

        cache.set(
            createRawCacheKey({
                actionName: "get_message",
                cacheScope: userScope,
                serviceName: "gmail",
            }),
            {
                name: "",
            },
        );

        const schema = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "get_message",
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
                fetcher: async () => createMetadataResponse({
                    description: "Get one Gmail message.",
                    name: "get_message",
                }),
            }),
        );

        expect(schema).toMatchObject({
            description: "Get one Gmail message.",
            name: "get_message",
            service: "gmail",
        });

        // The corrupt entry was replaced, so the next load needs no fetch.
        const cached = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "get_message",
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
            }),
        );

        expect(cached).toMatchObject({
            description: "Get one Gmail message.",
        });
    });

    test("loadConnectorActionSchema refresh bypasses cache and preserves metadata fields", async () => {
        const cache = createMemoryCache();

        await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
                fetcher: async () => createMetadataResponse({
                    description: "Cached schema.",
                }),
            }),
        );

        const schema = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                refresh: true,
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
                fetcher: async () => createMetadataResponse({
                    description: "Fresh schema.",
                    followUpActions: [
                        {
                            name: "get_message",
                        },
                    ],
                    providerPermissions: ["gmail.send"],
                    requiredScopes: ["gmail.send"],
                }),
            }),
        );

        expect(schema).toMatchObject({
            description: "Fresh schema.",
            followUpActions: [
                {
                    name: "get_message",
                },
            ],
            providerPermissions: ["gmail.send"],
            requiredScopes: ["gmail.send"],
        });

        const cached = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
            }),
        );

        expect(cached).toMatchObject({
            description: "Fresh schema.",
            providerPermissions: ["gmail.send"],
            requiredScopes: ["gmail.send"],
        });
    });

    test("loadConnectorActionSchema strips async lifecycle with non-positive wait interval", async () => {
        // A malformed lifecycle must not break the plain schema/run flows; it
        // is normalized away so the wait modes fail with their dedicated
        // "unsupported" errors instead.
        const schema = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "openai_image_async_result",
                serviceName: "fusion-api",
            },
            createCacheContext({
                fetcher: async () => createMetadataResponse({
                    asyncLifecycle: {
                        role: "result",
                        wait: {
                            intervalSeconds: 0,
                            resultField: "data",
                            state: {
                                failure: ["not_found"],
                                field: "state",
                                running: ["processing"],
                                success: ["completed"],
                            },
                        },
                    },
                    name: "openai_image_async_result",
                    service: "fusion-api",
                }),
            }),
        );

        expect(schema.asyncLifecycle).toBeUndefined();
    });

    test("loadConnectorActionSchema deletes stale entries when metadata reports not found", async () => {
        const cache = createMemoryCache();

        await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
                fetcher: async () => createMetadataResponse(),
            }),
        );

        await expect(loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                refresh: true,
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
                fetcher: async () => new Response("not found", {
                    status: 404,
                }),
            }),
        )).rejects.toThrow("errors.connectorMetadata.requestFailed");

        // The stale entry is gone, so the next load must fetch again.
        let fetchCount = 0;

        await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
                fetcher: async () => {
                    fetchCount += 1;

                    return createMetadataResponse();
                },
            }),
        );

        expect(fetchCount).toBe(1);
    });

    test("warmConnectorActionSchemas populates entries a later load serves without fetching", async () => {
        const cache = createMemoryCache();
        const cacheOptions: CacheOptions[] = [];

        await warmConnectorActionSchemas(
            [createSearchResultFixture()],
            userScope,
            createCacheContext({
                cache,
                cacheOptions,
            }),
        );

        expect(cacheOptions).toEqual([
            {
                defaultTtlMs: 60 * 60 * 1000,
                id: "connector-action-schema",
                maxEntries: 1000,
            },
        ]);

        const schema = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
            }),
        );

        expect(schema).toEqual({
            description: "Send a Gmail message.",
            inputSchema: {
                type: "object",
            },
            name: "send_mail",
            outputSchema: {
                type: "object",
            },
            providerPermissions: [],
            requiredScopes: [],
            service: "gmail",
        });
    });

    test("warmConnectorActionSchemas strips identity-scoped fields from cached entries", async () => {
        const cache = createMemoryCache();

        await warmConnectorActionSchemas(
            [createSearchResultFixture({
                authenticated: true,
            })],
            userScope,
            createCacheContext({
                cache,
            }),
        );

        // `authenticated` is scoped to the effective identity while the cache
        // key carries no team dimension, so the flag must never be stored.
        const schema = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
            }),
        );

        expect("authenticated" in schema).toBeFalse();
    });

    test("warmConnectorActionSchemas caches only actions carrying both schema payloads", async () => {
        const cache = createMemoryCache();

        await warmConnectorActionSchemas(
            [
                createSearchResultFixture(),
                createSearchResultFixture({
                    inputSchema: undefined,
                    name: "get_message",
                }),
            ],
            userScope,
            createCacheContext({
                cache,
            }),
        );

        const cacheable = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
            }),
        );

        expect(cacheable).toMatchObject({
            name: "send_mail",
        });
        await expect(isSchemaCacheMiss(cache, {
            actionName: "get_message",
            serviceName: "gmail",
        })).resolves.toBeTrue();
    });

    test("warmConnectorActionSchemas never touches the cache store when nothing is cacheable", async () => {
        const cacheOptions: CacheOptions[] = [];

        await warmConnectorActionSchemas(
            [createSearchResultFixture({
                inputSchema: undefined,
                outputSchema: undefined,
            })],
            userScope,
            createCacheContext({
                cacheOptions,
            }),
        );

        expect(cacheOptions).toEqual([]);
    });

    test("warmConnectorActionSchemas resolves and warns when the cache write fails", async () => {
        const cache = createMemoryCache();
        const logCapture = createLogCapture();

        cache.set = () => {
            throw new Error("cache write failed");
        };

        try {
            // Warming is best-effort: the returned promise must not reject.
            await warmConnectorActionSchemas(
                [createSearchResultFixture()],
                userScope,
                createCacheContext({
                    cache,
                    logger: logCapture.logger,
                }),
            );

            expect(logCapture.read()).toContain(
                "Failed to warm the connector action schema cache.",
            );
        }
        finally {
            logCapture.close();
        }
    });

    test("warmConnectorActionSchemas cleans up the legacy connector-actions directory without failing command flow", async () => {
        const rootPath = await createTemporaryDirectory("connector-schema-cache");

        try {
            const legacyDirectoryPath = join(rootPath, "connector-actions");

            await mkdir(legacyDirectoryPath, { recursive: true });
            await Bun.write(join(legacyDirectoryPath, "old.json"), "{}");

            await warmConnectorActionSchemas(
                [createSearchResultFixture()],
                userScope,
                createCacheContext({
                    cache: createMemoryCache(),
                    settingsFilePath: join(rootPath, "settings.toml"),
                }),
            );

            await expect(Bun.file(legacyDirectoryPath).exists()).resolves.toBeFalse();
        }
        finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    const invalidateCases: {
        error: unknown;
        evicted: boolean;
        name: string;
    }[] = [
        {
            error: new CliUserError("errors.connectorMetadata.requestFailed", 1, {
                status: 404,
            }),
            evicted: true,
            name: "deletes the entry on an http 404 failure",
        },
        {
            error: new CliUserError("errors.connectorRun.requestFailedWithCode", 1, {
                errorCode: "action_not_found",
                status: 400,
            }),
            evicted: true,
            name: "deletes the entry on an action_not_found failure",
        },
        {
            error: new Error("nope"),
            evicted: false,
            name: "keeps the entry on unrelated errors",
        },
        {
            error: {
                params: {
                    status: 404,
                },
            },
            evicted: false,
            name: "keeps the entry on non-CliUserError 404 shapes",
        },
    ];

    for (const invalidateCase of invalidateCases) {
        test(`invalidateConnectorActionSchemaOnNotFound ${invalidateCase.name}`, async () => {
            const cache = createMemoryCache();

            await warmConnectorActionSchemas(
                [createSearchResultFixture()],
                userScope,
                createCacheContext({
                    cache,
                }),
            );

            invalidateConnectorActionSchemaOnNotFound(
                {
                    actionName: "send_mail",
                    cacheScope: userScope,
                    error: invalidateCase.error,
                    serviceName: "gmail",
                },
                createCacheContext({
                    cache,
                }),
            );

            await expect(isSchemaCacheMiss(cache, {
                actionName: "send_mail",
                serviceName: "gmail",
            })).resolves.toBe(invalidateCase.evicted);
        });
    }

    test("invalidateConnectorActionSchemaOnNotFound removes only the selected identity", async () => {
        const cache = createMemoryCache();
        // Every cache-key dimension gets a neighbor differing in exactly that
        // dimension: account, endpoint, and service.
        const otherAccountScope = createConnectorSchemaCacheScope({
            accountId: "user-2",
            endpoint: "oomol.com",
        });
        const otherEndpointScope = createConnectorSchemaCacheScope({
            accountId: "user-1",
            endpoint: "staging.oomol.com",
        });

        await warmConnectorActionSchemas(
            [
                createSearchResultFixture(),
                createSearchResultFixture({
                    description: "Same account Slack schema.",
                    service: "slack",
                }),
            ],
            userScope,
            createCacheContext({
                cache,
            }),
        );
        await warmConnectorActionSchemas(
            [createSearchResultFixture({
                description: "Second account schema.",
            })],
            otherAccountScope,
            createCacheContext({
                cache,
            }),
        );
        await warmConnectorActionSchemas(
            [createSearchResultFixture({
                description: "Staging endpoint schema.",
            })],
            otherEndpointScope,
            createCacheContext({
                cache,
            }),
        );

        invalidateConnectorActionSchemaOnNotFound(
            {
                actionName: "send_mail",
                cacheScope: userScope,
                error: new CliUserError("errors.connectorMetadata.requestFailed", 1, {
                    status: 404,
                }),
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
            }),
        );

        await expect(isSchemaCacheMiss(cache, {
            actionName: "send_mail",
            serviceName: "gmail",
        })).resolves.toBeTrue();
        await expect(loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                serviceName: "slack",
            },
            createCacheContext({
                cache,
            }),
        )).resolves.toMatchObject({
            description: "Same account Slack schema.",
        });
        await expect(loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture({
                    cacheScope: otherAccountScope,
                }),
                actionName: "send_mail",
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
            }),
        )).resolves.toMatchObject({
            description: "Second account schema.",
        });
        await expect(loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture({
                    cacheScope: otherEndpointScope,
                }),
                actionName: "send_mail",
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
            }),
        )).resolves.toMatchObject({
            description: "Staging endpoint schema.",
        });
    });

    test("clearConnectorActionSchemaCache clears the schema namespace and legacy directory", async () => {
        const rootPath = await createTemporaryDirectory("connector-schema-cache-clear");
        const cache = createMemoryCache();
        const otherScope = createConnectorSchemaCacheScope({
            accountId: "user-2",
            endpoint: "oomol.com",
        });

        try {
            const legacyDirectoryPath = join(rootPath, "connector-actions");

            await mkdir(legacyDirectoryPath, { recursive: true });
            await Bun.write(join(legacyDirectoryPath, "old.json"), "{}");
            await warmConnectorActionSchemas(
                [createSearchResultFixture()],
                userScope,
                createCacheContext({
                    cache,
                }),
            );
            await warmConnectorActionSchemas(
                [createSearchResultFixture({
                    name: "get_message",
                })],
                otherScope,
                createCacheContext({
                    cache,
                }),
            );

            await clearConnectorActionSchemaCache(createCacheContext({
                cache,
                settingsFilePath: join(rootPath, "settings.toml"),
            }));

            await expect(isSchemaCacheMiss(cache, {
                actionName: "send_mail",
                serviceName: "gmail",
            })).resolves.toBeTrue();
            await expect(isSchemaCacheMiss(cache, {
                actionName: "get_message",
                cacheScope: otherScope,
                serviceName: "gmail",
            })).resolves.toBeTrue();
            await expect(Bun.file(legacyDirectoryPath).exists()).resolves.toBeFalse();
        }
        finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});

// Probes whether the cache misses for the given identity through the public
// loader: a miss reaches the metadata fetcher, a hit never does. The probe
// serves a real metadata response, so a missed identity is cached afterwards —
// call it only once per identity, after the assertions that need a cold entry.
async function isSchemaCacheMiss(
    cache: Cache<unknown>,
    identity: {
        actionName: string;
        cacheScope?: ConnectorSchemaCacheScope;
        serviceName: string;
    },
): Promise<boolean> {
    let fetched = false;

    await loadConnectorActionSchema(
        {
            target: createConnectorTargetFixture(
                identity.cacheScope === undefined
                    ? {}
                    : {
                            cacheScope: identity.cacheScope,
                        },
            ),
            actionName: identity.actionName,
            serviceName: identity.serviceName,
        },
        createCacheContext({
            cache,
            fetcher: async () => {
                fetched = true;

                return createMetadataResponse({
                    name: identity.actionName,
                    service: identity.serviceName,
                });
            },
        }),
    );

    return fetched;
}

function createSearchResultFixture(
    overrides: Partial<ConnectorActionSearchResult> = {},
): ConnectorActionSearchResult {
    return {
        authenticated: true,
        ...createConnectorActionFixture(),
        ...overrides,
    };
}

// Deliberate replica of the module's private cache-key encoding. The cache
// contract cannot enumerate or address entries, and a corrupt entry is the one
// cache state the public interface can never produce, so the parse-failure
// test seeds it at the raw key. Keep in sync with the encoding in
// schema-cache.ts; every other test goes through the public operations.
function createRawCacheKey(identity: {
    actionName: string;
    cacheScope: ConnectorSchemaCacheScope;
    serviceName: string;
}): string {
    return JSON.stringify({
        scope: identity.cacheScope,
        serviceName: identity.serviceName,
        actionName: identity.actionName,
    });
}

function createMetadataResponse(overrides: {
    asyncLifecycle?: ConnectorActionMetadata["asyncLifecycle"];
    description?: string;
    followUpActions?: unknown;
    name?: string;
    providerPermissions?: string[];
    requiredScopes?: string[];
    service?: string;
} = {}): Response {
    const name = overrides.name ?? "send_mail";
    const service = overrides.service ?? "gmail";

    return new Response(JSON.stringify({
        data: {
            asyncLifecycle: overrides.asyncLifecycle,
            description: overrides.description ?? "Send a Gmail message.",
            followUpActions: overrides.followUpActions ?? [],
            id: `${service}.${name}`,
            inputSchema: {
                type: "object",
            },
            name,
            outputSchema: {
                type: "object",
            },
            providerPermissions: overrides.providerPermissions ?? [],
            requiredScopes: overrides.requiredScopes ?? [],
            service,
        },
    }));
}

function createCacheContext(options: {
    cache?: Cache<unknown>;
    cacheOptions?: CacheOptions[];
    fetcher?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
    logger?: Logger;
    settingsFilePath?: string;
} = {}) {
    const emptySettings = {} as AppSettings;

    return {
        cacheStore: createCacheStore(options.cache, options.cacheOptions),
        fetcher: options.fetcher ?? (async () => {
            throw new Error("Unexpected fetch");
        }),
        logger: options.logger ?? pino({
            enabled: false,
        }),
        settingsStore: {
            getFilePath: () => options.settingsFilePath ?? "",
            read: async () => emptySettings,
            update: async (updater: (settings: AppSettings) => AppSettings) =>
                updater(emptySettings),
            write: async (value: AppSettings) => value,
        },
        translator: createTranslator("en"),
    };
}
