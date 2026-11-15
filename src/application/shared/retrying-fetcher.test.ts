import { describe, expect, test } from "bun:test";

import { createLogCapture } from "../../../__tests__/helpers.ts";
import { createRetryingFetcher, sendOnce } from "./retrying-fetcher.ts";

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

    test("stops waiting for a retry as soon as the request's deadline passes", async () => {
        const logCapture = createLogCapture();
        let fetchCount = 0;

        try {
            const fetcher = createRetryingFetcher({
                fetcher: async () => {
                    fetchCount += 1;

                    return new Response("unavailable", { status: 503 });
                },
                logger: logCapture.logger,
            });
            const startedAt = Date.now();

            // The first retry is due after a second, well past this deadline.
            await expect(fetcher("https://example.com/items", { signal: AbortSignal.timeout(30) }))
                .rejects
                .toMatchObject({ name: "TimeoutError" });

            expect(fetchCount).toBe(1);
            expect(Date.now() - startedAt).toBeLessThan(800);
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

    test("sends a request marked as single-attempt exactly once", async () => {
        const logCapture = createLogCapture();
        const retryDelays: number[] = [];
        const answers: (() => Response)[] = [
            () => new Response("busy", { status: 503 }),
            () => {
                throw new Error("temporary network failure");
            },
            () => new Response("busy", { status: 503 }),
            () => new Response("ok", { status: 200 }),
        ];
        let fetchCount = 0;

        try {
            const fetcher = createRetryingFetcher({
                fetcher: async () => {
                    fetchCount += 1;

                    return answers.shift()!();
                },
                logger: logCapture.logger,
                sleep: async (delayMs) => {
                    retryDelays.push(delayMs);
                },
            });
            const controller = new AbortController();
            const once = { signal: sendOnce(controller.signal) };

            expect((await fetcher("https://example.com/items", once)).status).toBe(503);
            await expect(fetcher("https://example.com/items", once)).rejects.toThrow("temporary network failure");
            expect(fetchCount).toBe(2);
            expect(retryDelays).toEqual([]);

            // A request on any other signal is retried as usual.
            expect((await fetcher("https://example.com/items", { signal: new AbortController().signal })).status).toBe(200);
            expect(fetchCount).toBe(4);
            expect(retryDelays).toEqual([1_000]);
        }
        finally {
            logCapture.close();
        }
    });
});
