import type { Cache, CacheOptions } from "../../contracts/cache.ts";
import type { AppSettings } from "../../schemas/settings.ts";

import type { ConnectorActionMetadata } from "./shared.ts";
import { mkdir, rm } from "node:fs/promises";

import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import pino from "pino";
import {
    createCacheStore,
    createConnectorActionFixture,
    createConnectorTargetFixture,
    createMemoryCache,
    createTemporaryDirectory,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { CliUserError } from "../../contracts/cli.ts";

import {
    cacheConnectorActionSchemas,
    clearConnectorActionSchemaCache,
    createConnectorActionSchemaCacheKey,
    createConnectorActionSchemaOutput,
    createConnectorSchemaCacheScope,
    deleteConnectorActionSchemaCache,
    isConnectorActionSchemaNotFoundError,
    loadConnectorActionSchema,
} from "./schema-cache.ts";

// The scope every fixture-backed test shares; variant scopes are built
// inline where a test exists to prove key divergence.
const userScope = createConnectorSchemaCacheScope({
    accountId: "user-1",
    endpoint: "oomol.com",
});

describe("connector schema cache", () => {
    test("createConnectorActionSchemaCacheKey includes scope, service, and action identity", () => {
        const baseKey = createConnectorActionSchemaCacheKey({
            actionName: "send_mail",
            cacheScope: userScope,
            serviceName: "gmail",
        });

        expect(JSON.parse(baseKey)).toEqual({
            scope: userScope,
            actionName: "send_mail",
            serviceName: "gmail",
        });
        expect(baseKey).not.toBe(createConnectorActionSchemaCacheKey({
            actionName: "send_mail",
            cacheScope: createConnectorSchemaCacheScope({
                accountId: "user-2",
                endpoint: "oomol.com",
            }),
            serviceName: "gmail",
        }));
        expect(baseKey).not.toBe(createConnectorActionSchemaCacheKey({
            actionName: "send_mail",
            cacheScope: createConnectorSchemaCacheScope({
                accountId: "user-1",
                endpoint: "staging.oomol.com",
            }),
            serviceName: "gmail",
        }));
        expect(baseKey).not.toBe(createConnectorActionSchemaCacheKey({
            actionName: "get_message",
            cacheScope: userScope,
            serviceName: "gmail",
        }));
    });

    test("cacheConnectorActionSchemas stores search results in the SQLite cache namespace shape", async () => {
        const cache = createMemoryCache();
        const cacheOptions: CacheOptions[] = [];

        await cacheConnectorActionSchemas(
            [createConnectorActionFixture()],
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
        expect(cache.get(createConnectorActionSchemaCacheKey({
            actionName: "send_mail",
            cacheScope: userScope,
            serviceName: "gmail",
        }))).toEqual({
            ...createConnectorActionFixture(),
            providerPermissions: [],
            requiredScopes: [],
        });
    });

    test("loadConnectorActionSchema reuses a cached schema without fetching", async () => {
        const cache = createMemoryCache();
        cache.set(
            createConnectorActionSchemaCacheKey({
                actionName: "send_mail",
                cacheScope: userScope,
                serviceName: "gmail",
            }),
            createConnectorActionFixture({
                description: "Cached schema.",
            }),
        );

        let fetchCount = 0;
        const schema = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "send_mail",
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
                fetcher: async () => {
                    fetchCount += 1;

                    return new Response("unexpected");
                },
            }),
        );

        expect(schema).toEqual({
            description: "Cached schema.",
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
        expect(fetchCount).toBe(0);
    });

    test("loadConnectorActionSchema refetches lifecycle-less cache entries when the async lifecycle is required", async () => {
        const cache = createMemoryCache();
        const cacheKey = createConnectorActionSchemaCacheKey({
            actionName: "send_mail",
            cacheScope: userScope,
            serviceName: "gmail",
        });

        cache.set(cacheKey, createConnectorActionFixture({
            description: "Search-seeded schema.",
        }));

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
        expect(cache.get(cacheKey)).toMatchObject({
            description: "Fresh schema.",
        });
    });

    test("loadConnectorActionSchema reuses cached entries with an async lifecycle when it is required", async () => {
        const cache = createMemoryCache();

        cache.set(
            createConnectorActionSchemaCacheKey({
                actionName: "openai_image_async_submit",
                cacheScope: userScope,
                serviceName: "fusion-api",
            }),
            {
                ...createConnectorActionFixture({
                    name: "openai_image_async_submit",
                    service: "fusion-api",
                }),
                asyncLifecycle: {
                    role: "submit",
                    resultAction: "openai_image_async_result",
                    handle: {
                        inputField: "sessionID",
                        outputField: "sessionId",
                    },
                },
            },
        );

        let fetchCount = 0;
        const schema = await loadConnectorActionSchema(
            {
                target: createConnectorTargetFixture(),
                actionName: "openai_image_async_submit",
                requireAsyncLifecycle: true,
                serviceName: "fusion-api",
            },
            createCacheContext({
                cache,
                fetcher: async () => {
                    fetchCount += 1;

                    return new Response("unexpected");
                },
            }),
        );

        expect(schema).toMatchObject({
            asyncLifecycle: {
                role: "submit",
            },
            name: "openai_image_async_submit",
        });
        expect(fetchCount).toBe(0);
    });

    test("loadConnectorActionSchema refreshes invalid cache content from metadata", async () => {
        const cache = createMemoryCache();
        const cacheKey = createConnectorActionSchemaCacheKey({
            actionName: "get_message",
            cacheScope: userScope,
            serviceName: "gmail",
        });

        cache.set(cacheKey, {
            name: "",
        });

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
        expect(cache.get(cacheKey)).toMatchObject({
            description: "Get one Gmail message.",
            name: "get_message",
            service: "gmail",
        });
    });

    test("loadConnectorActionSchema refresh bypasses cache and preserves metadata fields", async () => {
        const cache = createMemoryCache();
        const cacheKey = createConnectorActionSchemaCacheKey({
            actionName: "send_mail",
            cacheScope: userScope,
            serviceName: "gmail",
        });

        cache.set(cacheKey, createConnectorActionFixture({
            description: "Cached schema.",
        }));

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
        expect(cache.get(cacheKey)).toMatchObject({
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
        const cacheKey = createConnectorActionSchemaCacheKey({
            actionName: "send_mail",
            cacheScope: userScope,
            serviceName: "gmail",
        });

        cache.set(cacheKey, createConnectorActionFixture());

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
        expect(cache.get(cacheKey)).toBeNull();
    });

    test("deleteConnectorActionSchemaCache removes only the selected identity", () => {
        const cache = createMemoryCache();
        const firstKey = createConnectorActionSchemaCacheKey({
            actionName: "send_mail",
            cacheScope: userScope,
            serviceName: "gmail",
        });
        const secondKey = createConnectorActionSchemaCacheKey({
            actionName: "send_mail",
            cacheScope: createConnectorSchemaCacheScope({
                accountId: "user-2",
                endpoint: "oomol.com",
            }),
            serviceName: "gmail",
        });

        cache.set(firstKey, createConnectorActionFixture());
        cache.set(secondKey, createConnectorActionFixture({
            description: "Second account schema.",
        }));

        expect(deleteConnectorActionSchemaCache(
            {
                actionName: "send_mail",
                cacheScope: userScope,
                serviceName: "gmail",
            },
            createCacheContext({
                cache,
            }),
        )).toBeTrue();
        expect(cache.get(firstKey)).toBeNull();
        expect(cache.get(secondKey)).toMatchObject({
            description: "Second account schema.",
        });
    });

    test("clearConnectorActionSchemaCache clears the schema namespace and legacy directory", async () => {
        const rootPath = await createTemporaryDirectory("connector-schema-cache-clear");
        const cache = createMemoryCache();
        const firstKey = createConnectorActionSchemaCacheKey({
            actionName: "send_mail",
            cacheScope: userScope,
            serviceName: "gmail",
        });
        const secondKey = createConnectorActionSchemaCacheKey({
            actionName: "get_message",
            cacheScope: createConnectorSchemaCacheScope({
                accountId: "user-2",
                endpoint: "oomol.com",
            }),
            serviceName: "gmail",
        });

        try {
            const legacyDirectoryPath = join(rootPath, "connector-actions");

            await mkdir(legacyDirectoryPath, { recursive: true });
            await Bun.write(join(legacyDirectoryPath, "old.json"), "{}");
            cache.set(firstKey, createConnectorActionFixture());
            cache.set(secondKey, createConnectorActionFixture({
                description: "Second schema.",
            }));

            await clearConnectorActionSchemaCache(createCacheContext({
                cache,
                settingsFilePath: join(rootPath, "settings.toml"),
            }));

            expect(cache.get(firstKey)).toBeNull();
            expect(cache.get(secondKey)).toBeNull();
            await expect(Bun.file(legacyDirectoryPath).exists()).resolves.toBeFalse();
        }
        finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    test("createConnectorActionSchemaOutput exposes only the stable schema contract", () => {
        const schema = {
            description: "Fresh schema.",
            inputSchema: {
                type: "object",
            },
            name: "send_mail",
            outputSchema: {
                type: "object",
            },
            providerPermissions: ["gmail.send"],
            requiredScopes: ["gmail.send"],
            service: "gmail",
        } satisfies ConnectorActionMetadata;

        expect(createConnectorActionSchemaOutput(schema)).toEqual({
            description: "Fresh schema.",
            inputSchema: {
                type: "object",
            },
            name: "send_mail",
            outputSchema: {
                type: "object",
            },
            service: "gmail",
        });
    });

    test("createConnectorActionSchemaOutput preserves async submit output schema", () => {
        const schema = {
            asyncLifecycle: {
                role: "submit",
                resultAction: "openai_image_async_result",
                handle: {
                    inputField: "sessionID",
                    outputField: "sessionId",
                },
            },
            description: "Submit OpenAI image generation.",
            inputSchema: {
                type: "object",
            },
            name: "openai_image_async_submit",
            outputSchema: {
                properties: {
                    sessionId: {
                        type: "string",
                    },
                },
                type: "object",
            },
            providerPermissions: [],
            requiredScopes: [],
            service: "fusion-api",
        } satisfies ConnectorActionMetadata;

        expect(createConnectorActionSchemaOutput(schema)).toEqual({
            description: "Submit OpenAI image generation.",
            inputSchema: {
                type: "object",
            },
            name: "openai_image_async_submit",
            outputSchema: {
                properties: {
                    sessionId: {
                        type: "string",
                    },
                },
                type: "object",
            },
            service: "fusion-api",
        });
    });

    test("createConnectorActionSchemaOutput preserves async result output schema", () => {
        const schema = {
            asyncLifecycle: {
                role: "result",
                wait: {
                    intervalSeconds: 3,
                    resultField: "data",
                    state: {
                        failure: ["not_found"],
                        field: "state",
                        running: ["processing"],
                        success: ["completed"],
                    },
                },
            },
            description: "Get OpenAI image generation result.",
            inputSchema: {
                type: "object",
            },
            name: "openai_image_async_result",
            outputSchema: {
                anyOf: [
                    {
                        properties: {
                            data: {
                                properties: {
                                    images: {
                                        items: {
                                            type: "string",
                                        },
                                        type: "array",
                                    },
                                },
                                type: "object",
                            },
                            state: {
                                enum: ["completed"],
                                type: "string",
                            },
                        },
                        required: ["state", "data"],
                        type: "object",
                    },
                    {
                        properties: {
                            progress: {
                                type: "number",
                            },
                            state: {
                                enum: ["processing"],
                                type: "string",
                            },
                        },
                        required: ["state", "progress"],
                        type: "object",
                    },
                ],
            },
            providerPermissions: [],
            requiredScopes: [],
            service: "fusion-api",
        } satisfies ConnectorActionMetadata;

        expect(createConnectorActionSchemaOutput(schema)).toEqual({
            description: "Get OpenAI image generation result.",
            inputSchema: {
                type: "object",
            },
            name: "openai_image_async_result",
            outputSchema: schema.outputSchema,
            service: "fusion-api",
        });
    });

    test("isConnectorActionSchemaNotFoundError detects 404 and action_not_found failures", () => {
        expect(isConnectorActionSchemaNotFoundError(new Error("nope"))).toBeFalse();
        expect(isConnectorActionSchemaNotFoundError({
            params: {
                status: 404,
            },
        })).toBeFalse();
        expect(isConnectorActionSchemaNotFoundError(new CliUserError(
            "errors.connectorMetadata.requestFailed",
            1,
            {
                status: 404,
            },
        ))).toBeTrue();
        expect(isConnectorActionSchemaNotFoundError(new CliUserError(
            "errors.connectorRun.requestFailedWithCode",
            1,
            {
                errorCode: "action_not_found",
                status: 400,
            },
        ))).toBeTrue();
    });

    test("cache writes clean up the legacy connector-actions directory without failing command flow", async () => {
        const rootPath = await createTemporaryDirectory("connector-schema-cache");

        try {
            const legacyDirectoryPath = join(rootPath, "connector-actions");

            await mkdir(legacyDirectoryPath, { recursive: true });
            await Bun.write(join(legacyDirectoryPath, "old.json"), "{}");

            await cacheConnectorActionSchemas(
                [createConnectorActionFixture()],
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
});

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
    settingsFilePath?: string;
} = {}) {
    const emptySettings = {} as AppSettings;

    return {
        cacheStore: createCacheStore(options.cache, options.cacheOptions),
        fetcher: options.fetcher ?? (async () => {
            throw new Error("Unexpected fetch");
        }),
        logger: pino({
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
