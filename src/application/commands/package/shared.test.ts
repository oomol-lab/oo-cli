import type {
    Cache,
    CacheOptions,
    CacheStore,
} from "../../contracts/cache.ts";
import type { Fetcher } from "../../contracts/cli.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

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

function createCacheStore<Value>(
    cache: Cache<Value>,
    cacheOptions: CacheOptions[] = [],
): CacheStore {
    return {
        getFilePath: () => "",
        getCache: <CurrentValue>(options: CacheOptions) => {
            cacheOptions.push(options);

            return cache as unknown as Cache<CurrentValue>;
        },
        close() {},
    };
}

function createCache<Value>(handlers: {
    delete: Cache<Value>["delete"];
    get: Cache<Value>["get"];
    set: Cache<Value>["set"];
}): Cache<Value> {
    return {
        delete: handlers.delete,
        get: handlers.get,
        set: handlers.set,
        has(key) {
            return handlers.get(key) !== null;
        },
        clear: () => {},
    };
}
