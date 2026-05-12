import { describe, expect, test } from "bun:test";
import pino from "pino";

import { toRequest } from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";

import { loadConnectorSearchResults } from "./search-provider.ts";

describe("connector search provider", () => {
    test("returns search results without using the schema cache", async () => {
        const requests: Request[] = [];

        const results = await loadConnectorSearchResults(
            {
                account: {
                    apiKey: "secret-1",
                    endpoint: "oomol.com",
                    id: "user-1",
                },
                keywords: [],
                text: "send mail",
            },
            {
                fetcher: async (input, init) => {
                    const request = toRequest(input, init);

                    requests.push(request);

                    if (request.url.startsWith("https://search.")) {
                        return new Response(JSON.stringify({
                            data: [
                                {
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

                    if (request.url.startsWith("https://connector.")) {
                        return new Response(JSON.stringify({
                            data: ["gmail"],
                        }));
                    }

                    throw new Error(`Unexpected request: ${request.url}`);
                },
                logger: pino({
                    enabled: false,
                }),
                translator: createTranslator("en"),
            },
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
            "https://search.oomol.com/v1/connector-actions?q=send+mail",
            "https://connector.oomol.com/v1/apps/authenticated?service=gmail",
        ]);
    });
});
