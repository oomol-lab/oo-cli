import type { AppSettings } from "../../schemas/settings.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createCacheStore,
    createConnectorTargetFixture,
    createMemoryCache,
    createSelfHostedConnectorTargetFixture,
    createSettingsStore,
    toRequest,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";

import {
    createConnectorActionSchemaCacheKey,
    createConnectorSchemaCacheScope,
} from "./schema-cache.ts";
import { loadConnectorSearchResults } from "./search-provider.ts";

describe("connector search provider", () => {
    test("returns search results and warms the schema cache from schema payloads", async () => {
        const cache = createMemoryCache();
        const requests: Request[] = [];

        const results = await loadConnectorSearchResults(
            {
                target: createConnectorTargetFixture(),
                text: "send mail",
            },
            createSearchContext({
                cache,
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);

                    requests.push(request);

                    if (request.url.includes("/v1/actions/search")) {
                        return new Response(JSON.stringify({
                            success: true,
                            message: "ok",
                            data: [
                                {
                                    authenticated: true,
                                    description: "Send a Gmail message.",
                                    inputSchema: {
                                        type: "object",
                                    },
                                    name: "send_mail",
                                    outputSchema: {
                                        type: "object",
                                    },
                                    service: "gmail",
                                },
                            ],
                        }));
                    }

                    throw new Error(`Unexpected request: ${request.url}`);
                },
            }),
        );

        expect(results).toEqual([
            {
                authenticated: true,
                description: "Send a Gmail message.",
                name: "send_mail",
                service: "gmail",
            },
        ]);
        expect(requests.map(request => request.url)).toEqual([
            "https://connector.oomol.com/v1/actions/search?q=send+mail",
        ]);
        expect(cache.get(createConnectorActionSchemaCacheKey({
            actionName: "send_mail",
            cacheScope: createConnectorSchemaCacheScope({
                accountId: "user-1",
                endpoint: "oomol.com",
            }),
            serviceName: "gmail",
        }))).toMatchObject({
            description: "Send a Gmail message.",
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

    test("skips schema cache warming for results without schema payloads", async () => {
        const cache = createMemoryCache();

        const results = await loadConnectorSearchResults(
            {
                target: createConnectorTargetFixture(),
                text: "send mail",
            },
            createSearchContext({
                cache,
                fetcher: async () => new Response(JSON.stringify({
                    success: true,
                    message: "ok",
                    data: [
                        {
                            authenticated: true,
                            description: "Send a Gmail message.",
                            name: "send_mail",
                            service: "gmail",
                        },
                    ],
                })),
            }),
        );

        expect(results).toHaveLength(1);
        expect(cache.get(createConnectorActionSchemaCacheKey({
            actionName: "send_mail",
            cacheScope: createConnectorSchemaCacheScope({
                accountId: "user-1",
                endpoint: "oomol.com",
            }),
            serviceName: "gmail",
        }))).toBeNull();
    });

    test("returns search results when schema cache warming fails", async () => {
        const cache = createMemoryCache();

        cache.set = () => {
            throw new Error("cache write failed");
        };

        const results = await loadConnectorSearchResults(
            {
                target: createConnectorTargetFixture(),
                text: "send mail",
            },
            createSearchContext({
                cache,
                fetcher: async () => new Response(JSON.stringify({
                    success: true,
                    message: "ok",
                    data: [
                        {
                            authenticated: true,
                            description: "Send a Gmail message.",
                            inputSchema: {
                                type: "object",
                            },
                            name: "send_mail",
                            outputSchema: {
                                type: "object",
                            },
                            service: "gmail",
                        },
                    ],
                })),
            }),
        );

        expect(results).toEqual([
            {
                authenticated: true,
                description: "Send a Gmail message.",
                name: "send_mail",
                service: "gmail",
            },
        ]);
    });

    test("uses the wire authenticated field for self-hosted results without a follow-up request", async () => {
        const requests: Request[] = [];

        const results = await loadConnectorSearchResults(
            {
                target: createSelfHostedConnectorTargetFixture(),
                text: "send mail",
            },
            createSearchContext({
                cache: createMemoryCache(),
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);

                    requests.push(request);

                    if (request.url.includes("/v1/actions/search")) {
                        return new Response(JSON.stringify({
                            success: true,
                            data: [
                                {
                                    authenticated: true,
                                    description: "Send a Gmail message.",
                                    name: "send_mail",
                                    service: "gmail",
                                },
                                {
                                    authenticated: false,
                                    description: "Send a Slack message.",
                                    name: "post_message",
                                    service: "slack",
                                },
                            ],
                        }));
                    }

                    throw new Error(`Unexpected request: ${request.url}`);
                },
            }),
        );

        expect(requests.map(request => request.url)).toEqual([
            "http://localhost:3000/v1/actions/search?q=send+mail",
        ]);
        expect(results).toEqual([
            {
                authenticated: true,
                description: "Send a Gmail message.",
                name: "send_mail",
                service: "gmail",
            },
            {
                authenticated: false,
                description: "Send a Slack message.",
                name: "post_message",
                service: "slack",
            },
        ]);
    });

    test("uses the wire authenticated field without an authenticated services request for oomol targets", async () => {
        const requests: Request[] = [];

        const results = await loadConnectorSearchResults(
            {
                target: createConnectorTargetFixture(),
                text: "send mail",
            },
            createSearchContext({
                cache: createMemoryCache(),
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);

                    requests.push(request);

                    return new Response(JSON.stringify({
                        success: true,
                        data: [
                            {
                                authenticated: true,
                                description: "Send a Gmail message.",
                                name: "send_mail",
                                service: "gmail",
                            },
                            {
                                authenticated: false,
                                description: "Send a Slack message.",
                                name: "post_message",
                                service: "slack",
                            },
                        ],
                    }));
                },
            }),
        );

        expect(requests.map(request => request.url)).toEqual([
            "https://connector.oomol.com/v1/actions/search?q=send+mail",
        ]);
        expect(results).toEqual([
            {
                authenticated: true,
                description: "Send a Gmail message.",
                name: "send_mail",
                service: "gmail",
            },
            {
                authenticated: false,
                description: "Send a Slack message.",
                name: "post_message",
                service: "slack",
            },
        ]);
    });
});

function createSearchContext(options: {
    cache: ReturnType<typeof createMemoryCache>;
    fetcher: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}) {
    return {
        cacheStore: createCacheStore(options.cache),
        fetcher: options.fetcher,
        logger: pino({
            enabled: false,
        }),
        settingsStore: createSettingsStore({} as AppSettings),
        translator: createTranslator("en"),
    };
}
