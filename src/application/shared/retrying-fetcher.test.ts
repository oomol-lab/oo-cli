import { describe, expect, test } from "bun:test";

import { createLogCapture } from "../../../__tests__/helpers.ts";
import { createRetryingFetcher } from "./retrying-fetcher.ts";

describe("createRetryingFetcher", () => {
    test("retries network failures with exponential backoff", async () => {
        const logCapture = createLogCapture();
        const retryDelays: number[] = [];
        let fetchCount = 0;

        try {
            const fetcher = createRetryingFetcher({
                fetcher: async () => {
                    fetchCount += 1;

                    if (fetchCount <= 2) {
                        throw new Error("temporary network failure");
                    }

                    return new Response("ok", {
                        status: 200,
                    });
                },
                logger: logCapture.logger,
                sleep: async (delayMs) => {
                    retryDelays.push(delayMs);
                },
            });
            const response = await fetcher("https://example.com/items");

            expect(response.status).toBe(200);
            expect(fetchCount).toBe(3);
            expect(retryDelays).toEqual([1_000, 2_000]);
            expect(logCapture.read()).toContain(
                "\"msg\":\"HTTP request retry scheduled after a network failure.\"",
            );
        }
        finally {
            logCapture.close();
        }
    });

    test("retries configured upstream statuses with exponential backoff", async () => {
        const logCapture = createLogCapture();
        const retryDelays: number[] = [];
        let fetchCount = 0;

        try {
            const fetcher = createRetryingFetcher({
                fetcher: async () => {
                    fetchCount += 1;

                    return new Response(fetchCount < 3 ? "busy" : "ok", {
                        status: fetchCount < 3 ? 503 : 200,
                    });
                },
                logger: logCapture.logger,
                sleep: async (delayMs) => {
                    retryDelays.push(delayMs);
                },
            });
            const response = await fetcher(
                "https://example.com/items",
                {
                    method: "POST",
                },
            );

            expect(response.status).toBe(200);
            expect(fetchCount).toBe(3);
            expect(retryDelays).toEqual([1_000, 2_000]);
            expect(logCapture.read()).toContain(
                "\"msg\":\"HTTP request retry scheduled after a retryable response.\"",
            );
        }
        finally {
            logCapture.close();
        }
    });

    test("does not retry non-retryable failures or aborted requests", async () => {
        const logCapture = createLogCapture();
        const retryDelays: number[] = [];
        let statusFetchCount = 0;
        let abortFetchCount = 0;
        const abortedSignal = AbortSignal.abort();

        try {
            const statusFetcher = createRetryingFetcher({
                fetcher: async () => {
                    statusFetchCount += 1;

                    return new Response("internal error", {
                        status: 500,
                    });
                },
                logger: logCapture.logger,
                sleep: async (delayMs) => {
                    retryDelays.push(delayMs);
                },
            });
            const abortFetcher = createRetryingFetcher({
                fetcher: async () => {
                    abortFetchCount += 1;
                    throw Object.assign(new Error("aborted"), {
                        name: "AbortError",
                    });
                },
                logger: logCapture.logger,
                sleep: async (delayMs) => {
                    retryDelays.push(delayMs);
                },
            });
            const response = await statusFetcher("https://example.com/items");

            expect(response.status).toBe(500);
            expect(statusFetchCount).toBe(1);
            await expect(abortFetcher(
                "https://example.com/items",
                {
                    signal: abortedSignal,
                },
            )).rejects.toMatchObject({
                name: "AbortError",
            });
            expect(abortFetchCount).toBe(1);
            expect(retryDelays).toEqual([]);
        }
        finally {
            logCapture.close();
        }
    });
});
