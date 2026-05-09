import type {
    Cache,
} from "../../contracts/cache.ts";
import type { Fetcher } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createCache,
    createCacheStore,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { loadPackageInfo, parsePackageSpecifier } from "./shared.ts";

const packageInfoAccount = {
    apiKey: "secret-1",
    endpoint: "oomol.com",
    id: "user-1",
} as const;
const packageInfoRequestLanguage = "en" as const;

describe("loadPackageInfo", () => {
    test("normalizes input ui widget keys, applies input schema patches, and keeps output schema raw", async () => {
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
        const context = createPackageInfoContext(
            cache,
            (async () => {
                fetchCount += 1;

                return new Response(JSON.stringify(createRawPackageInfoResponse()));
            }) satisfies Fetcher,
        );
        const packageSpecifier = parsePackageSpecifier("qrcode@1.0.4");
        const expectedResponse = createNormalizedPackageInfoResponse();

        const firstResponse = await loadPackageInfo(
            packageSpecifier,
            packageInfoAccount,
            packageInfoRequestLanguage,
            context,
        );
        const secondResponse = await loadPackageInfo(
            packageSpecifier,
            packageInfoAccount,
            packageInfoRequestLanguage,
            context,
        );

        expect(firstResponse).toEqual(expectedResponse);
        expect(secondResponse).toEqual(firstResponse);
        expect(fetchCount).toBe(1);
    });

    test("converts raw isPrivate visibility into normalized access", async () => {
        for (const { access, isPrivate } of [
            { access: "private", isPrivate: true },
            { access: "public", isPrivate: false },
        ] as const) {
            const cacheValues = new Map<string, string>();
            const context = createPackageInfoContext(
                createCache<string>({
                    delete(key) {
                        return cacheValues.delete(key);
                    },
                    get(key) {
                        return cacheValues.get(key) ?? null;
                    },
                    set(key, value) {
                        cacheValues.set(key, value);
                    },
                }),
                (async () => new Response(JSON.stringify({
                    ...createRawPackageInfoResponse(),
                    isPrivate,
                }))) satisfies Fetcher,
            );

            const response = await loadPackageInfo(
                parsePackageSpecifier(`qrcode-${access}`),
                packageInfoAccount,
                packageInfoRequestLanguage,
                context,
            );

            expect(response.access).toBe(access);
            expect(response).not.toHaveProperty("isPrivate");
        }
    });

    test("preserves array ext placeholders and omits empty ext objects in input schemas", async () => {
        const cacheValues = new Map<string, string>();
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
        const context = createPackageInfoContext(
            cache,
            (async () => new Response(JSON.stringify({
                packageName: "schema-lab",
                packageVersion: "2.0.0",
                title: "Schema Lab",
                description: "Schema edge cases",
                blocks: [
                    {
                        blockName: "Normalize",
                        title: "Normalize",
                        description: "Covers schema edge cases.",
                        inputHandleDefs: [
                            {
                                handle: "choiceInput",
                                description: "Choice input",
                                json_schema: {
                                    anyOf: [
                                        {
                                            "type": "string",
                                            "ui:widget": "text",
                                        },
                                        {
                                            type: "number",
                                        },
                                    ],
                                },
                            },
                            {
                                handle: "plainObjectInput",
                                description: "Plain object input",
                                json_schema: {
                                    type: "object",
                                    properties: {
                                        name: {
                                            "type": "string",
                                            "ui:help": "ignored",
                                        },
                                    },
                                },
                            },
                        ],
                        outputHandleDefs: [],
                    },
                ],
            }))) satisfies Fetcher,
        );

        const response = await loadPackageInfo(
            parsePackageSpecifier("schema-lab@2.0.0"),
            packageInfoAccount,
            packageInfoRequestLanguage,
            context,
        );

        expect(response).toEqual({
            blocks: [
                {
                    blockName: "Normalize",
                    description: "Covers schema edge cases.",
                    inputHandle: {
                        choiceInput: {
                            description: "Choice input",
                            ext: {
                                anyOf: [
                                    {
                                        widget: "text",
                                    },
                                    null,
                                ],
                            },
                            schema: {
                                anyOf: [
                                    {
                                        type: "string",
                                    },
                                    {
                                        type: "number",
                                    },
                                ],
                            },
                        },
                        plainObjectInput: {
                            description: "Plain object input",
                            schema: {
                                properties: {
                                    name: {
                                        type: "string",
                                    },
                                },
                                type: "object",
                            },
                        },
                    },
                    outputHandle: {},
                    title: "Normalize",
                },
            ],
            description: "Schema edge cases",
            displayName: "Schema Lab",
            packageName: "schema-lab",
            packageVersion: "2.0.0",
        });
        expect(response.blocks[0]?.inputHandle.plainObjectInput).not.toHaveProperty("ext");
    });

    test("removes input handles whose ui widget targets cloud storage", async () => {
        const cacheValues = new Map<string, string>();
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
        const context = createPackageInfoContext(
            cache,
            (async () => new Response(JSON.stringify({
                packageName: "storage-lab",
                packageVersion: "1.0.0",
                title: "Storage Lab",
                description: "Cloud storage handle filter.",
                blocks: [
                    {
                        blockName: "Run",
                        title: "Run",
                        description: "Mixed widgets.",
                        inputHandleDefs: [
                            {
                                handle: "savePath",
                                description: "Save path",
                                json_schema: {
                                    "type": "string",
                                    "ui:widget": "save",
                                },
                            },
                            {
                                handle: "dirPath",
                                description: "Directory path",
                                json_schema: {
                                    "type": "string",
                                    "ui:widget": "dir",
                                },
                            },
                            {
                                handle: "filePath",
                                description: "File path",
                                json_schema: {
                                    "type": "string",
                                    "ui:widget": "file",
                                },
                            },
                            {
                                handle: "freeText",
                                description: "Free text",
                                json_schema: {
                                    type: "string",
                                },
                            },
                        ],
                        outputHandleDefs: [
                            {
                                handle: "savedTo",
                                description: "Save target",
                                json_schema: {
                                    "type": "string",
                                    "ui:widget": "save",
                                },
                            },
                        ],
                    },
                ],
            }))) satisfies Fetcher,
        );

        const response = await loadPackageInfo(
            parsePackageSpecifier("storage-lab@1.0.0"),
            packageInfoAccount,
            packageInfoRequestLanguage,
            context,
        );

        const block = response.blocks[0];

        expect(Object.keys(block?.inputHandle ?? {})).toEqual([
            "filePath",
            "freeText",
        ]);
        expect(Object.keys(block?.outputHandle ?? {})).toEqual(["savedTo"]);
    });

    test("deserializes preloaded cached normalized responses without fetching", async () => {
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
        const packageSpecifier = parsePackageSpecifier("qrcode@1.0.4");
        const expectedResponse = createNormalizedPackageInfoResponse();

        cacheValues.set(
            createPackageInfoCacheKeyForTest(
                packageInfoAccount,
                expectedResponse.packageName,
                expectedResponse.packageVersion,
                packageInfoRequestLanguage,
            ),
            JSON.stringify(expectedResponse),
        );

        const response = await loadPackageInfo(
            packageSpecifier,
            packageInfoAccount,
            packageInfoRequestLanguage,
            createPackageInfoContext(
                cache,
                (async () => {
                    fetchCount += 1;
                    throw new Error("fetcher should not be called for cached package info");
                }) satisfies Fetcher,
            ),
        );

        expect(response).toEqual(expectedResponse);
        expect(fetchCount).toBe(0);
    });
});

describe("parsePackageSpecifier", () => {
    test("accepts semver prerelease and build metadata when semver is required", () => {
        expect(parsePackageSpecifier("pkg@1.2.3-beta.1+build.01", {
            requireSemver: true,
        })).toEqual({
            packageName: "pkg",
            packageVersion: "1.2.3-beta.1+build.01",
            shouldReadCache: true,
        });
    });

    test("rejects invalid semver when semver is required", () => {
        expect(() => parsePackageSpecifier("pkg@1.2.3-01", {
            requireSemver: true,
            requireVersion: true,
        })).toThrow("errors.packageInfo.invalidPackageSpecifier");
    });

    test("keeps invalid semver suffixes as latest when version is optional", () => {
        expect(parsePackageSpecifier("pkg@1.2.3-01", {
            requireSemver: true,
        })).toEqual({
            packageName: "pkg@1.2.3-01",
            packageVersion: "latest",
            shouldReadCache: false,
        });
    });
});

function createRawPackageInfoResponse() {
    return {
        packageName: "qrcode",
        packageVersion: "1.0.4",
        title: "QR Code",
        description: "The QR Code Toolkit.",
        blocks: [
            {
                blockName: "Exist",
                title: "Exist QR Code",
                description: "Checks whether an image contains a QR code.",
                inputHandleDefs: [
                    {
                        handle: "input",
                        description: "Image input",
                        nullable: false,
                        value: "sample.png",
                        json_schema: {
                            "anyOf": [
                                {
                                    "type": "string",
                                    "ui:widget": "text",
                                    "ui:placeholder": "Base64 text input",
                                },
                            ],
                            "ui:help": "ignored",
                            "ui:options": {
                                labels: ["Base64 with Text"],
                            },
                        },
                    },
                    {
                        handle: "fileInput",
                        description: "Input file",
                        json_schema: {
                            "type": "string",
                            "ui:widget": "file",
                        },
                    },
                ],
                outputHandleDefs: [
                    {
                        handle: "output",
                        description: "Boolean result",
                        json_schema: {
                            "type": "boolean",
                            "ui:widget": "switch",
                            "ui:tone": "success",
                        },
                    },
                ],
            },
        ],
    };
}

function createNormalizedPackageInfoResponse() {
    return {
        blocks: [
            {
                blockName: "Exist",
                description: "Checks whether an image contains a QR code.",
                inputHandle: {
                    input: {
                        description: "Image input",
                        ext: {
                            anyOf: [
                                {
                                    widget: "text",
                                },
                            ],
                        },
                        nullable: false,
                        schema: {
                            anyOf: [
                                {
                                    type: "string",
                                },
                            ],
                        },
                        value: "sample.png",
                    },
                    fileInput: {
                        description: "Input file",
                        ext: {
                            widget: "file",
                        },
                        schema: {
                            format: "uri",
                            type: "string",
                        },
                    },
                },
                outputHandle: {
                    output: {
                        description: "Boolean result",
                        schema: {
                            "ui:tone": "success",
                            "ui:widget": "switch",
                            "type": "boolean",
                        },
                    },
                },
                title: "Exist QR Code",
            },
        ],
        description: "The QR Code Toolkit.",
        displayName: "QR Code",
        packageName: "qrcode",
        packageVersion: "1.0.4",
    };
}

function createPackageInfoContext(
    cache: Cache<string>,
    fetcher: Fetcher,
) {
    return {
        cacheStore: createCacheStore(cache),
        fetcher,
        logger: pino({
            enabled: false,
        }),
        translator: createTranslator("en"),
    };
}

function createPackageInfoCacheKeyForTest(
    account: Pick<typeof packageInfoAccount, "endpoint" | "id">,
    packageName: string,
    packageVersion: string,
    requestLanguage: string,
): string {
    return JSON.stringify({
        accountId: account.id,
        endpoint: account.endpoint,
        requestLanguage,
        packageName,
        packageVersion,
    });
}
