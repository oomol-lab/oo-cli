import type { AppSettings } from "../../schemas/settings.ts";
import { rm } from "node:fs/promises";

import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createConnectorActionFixture,
    createTemporaryDirectory,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import {
    ensureConnectorActionSchemaReference,
    persistConnectorActionSchemaCache,
    renderConnectorActionSchemaCache,
    resolveConnectorActionSchemaPath,
} from "./schema-cache.ts";

describe("connector schema cache", () => {
    test("resolveConnectorActionSchemaPath places schema files alongside the data directory", () => {
        expect(resolveConnectorActionSchemaPath(
            join("/tmp", "oo", "settings.toml"),
            "gmail",
            "send_mail",
        )).toBe(join("/tmp", "oo", "connector-actions", "gmail", "send_mail.json"));
    });

    test("resolveConnectorActionSchemaPath keeps service and action names unambiguous", () => {
        expect(resolveConnectorActionSchemaPath(
            join("/tmp", "oo", "settings.toml"),
            "foo.bar",
            "baz",
        )).not.toBe(resolveConnectorActionSchemaPath(
            join("/tmp", "oo", "settings.toml"),
            "foo",
            "bar.baz",
        ));
    });

    test("persistConnectorActionSchemaCache writes the cache file to the connector-actions directory", async () => {
        const rootPath = await createTemporaryDirectory("connector-schema-cache");

        try {
            const schemaPath = await persistConnectorActionSchemaCache(
                createConnectorActionFixture(),
                createCacheContext(rootPath),
            );

            expect(schemaPath).toBe(
                join(rootPath, "connector-actions", "gmail", "send_mail.json"),
            );
            await expect(Bun.file(schemaPath).text()).resolves.toBe(
                renderConnectorActionSchemaCache(createConnectorActionFixture()),
            );
        }
        finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    test("ensureConnectorActionSchemaReference reuses a cached schema without fetching", async () => {
        const rootPath = await createTemporaryDirectory("connector-schema-cache");

        try {
            const schemaPath = resolveConnectorActionSchemaPath(
                join(rootPath, "settings.toml"),
                "gmail",
                "send_mail",
            );

            await Bun.write(
                schemaPath,
                renderConnectorActionSchemaCache(createConnectorActionFixture({
                    description: "Cached schema.",
                })),
            );

            let fetchCount = 0;
            const reference = await ensureConnectorActionSchemaReference(
                {
                    actionName: "send_mail",
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                    serviceName: "gmail",
                },
                createCacheContext(rootPath, {
                    fetcher: async () => {
                        fetchCount += 1;

                        return new Response("unexpected");
                    },
                }),
            );

            expect(reference).toEqual({
                description: "Cached schema.",
                inputSchema: {
                    type: "object",
                },
                name: "send_mail",
                outputSchema: {
                    type: "object",
                },
                schemaPath,
                service: "gmail",
            });
            expect(fetchCount).toBe(0);
        }
        finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });

    test("ensureConnectorActionSchemaReference refreshes invalid cache content from metadata", async () => {
        const rootPath = await createTemporaryDirectory("connector-schema-cache");

        try {
            const schemaPath = resolveConnectorActionSchemaPath(
                join(rootPath, "settings.toml"),
                "gmail",
                "get_message",
            );

            await Bun.write(schemaPath, "{");

            const reference = await ensureConnectorActionSchemaReference(
                {
                    actionName: "get_message",
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                    serviceName: "gmail",
                },
                createCacheContext(rootPath, {
                    fetcher: async () => new Response(JSON.stringify({
                        data: {
                            description: "Get one Gmail message.",
                            id: "action-1",
                            inputSchema: {
                                type: "object",
                            },
                            name: "get_message",
                            outputSchema: {
                                type: "object",
                            },
                            providerPermissions: [],
                            requiredScopes: [],
                            service: "gmail",
                        },
                    })),
                }),
            );

            expect(reference).toEqual({
                description: "Get one Gmail message.",
                inputSchema: {
                    type: "object",
                },
                name: "get_message",
                outputSchema: {
                    type: "object",
                },
                schemaPath,
                service: "gmail",
            });
            await expect(Bun.file(schemaPath).text()).resolves.toContain(
                "\"name\": \"get_message\"",
            );
        }
        finally {
            await rm(rootPath, { force: true, recursive: true });
        }
    });
});

function createCacheContext(
    rootPath: string,
    options: {
        fetcher?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
    } = {},
) {
    const emptySettings = {} as AppSettings;

    return {
        fetcher: options.fetcher ?? (async () => {
            throw new Error("Unexpected fetch");
        }),
        logger: pino({
            enabled: false,
        }),
        settingsStore: {
            getFilePath: () => join(rootPath, "settings.toml"),
            read: async () => emptySettings,
            update: async (updater: (settings: AppSettings) => AppSettings) =>
                updater(emptySettings),
            write: async (value: AppSettings) => value,
        },
        translator: createTranslator("en"),
    };
}
