import { describe, expect, test } from "bun:test";
import { mapWithConcurrency } from "./concurrency.ts";

describe("mapWithConcurrency", () => {
    test("returns results in input order when workers finish out of order", async () => {
        const results = await mapWithConcurrency(
            [30, 10, 20],
            3,
            async (delayMs, index) => {
                await Bun.sleep(delayMs);
                return `item-${index}`;
            },
        );

        expect(results).toEqual(["item-0", "item-1", "item-2"]);
    });

    test("never runs more than the limit at once", async () => {
        let inFlight = 0;
        let maxInFlight = 0;

        await mapWithConcurrency(
            Array.from({ length: 10 }, (_, index) => index),
            3,
            async () => {
                inFlight += 1;
                maxInFlight = Math.max(maxInFlight, inFlight);
                await Bun.sleep(1);
                inFlight -= 1;
            },
        );

        expect(maxInFlight).toBe(3);
    });

    test("returns an empty array for empty input", async () => {
        expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
    });

    test("stops scheduling after a failure and waits for in-flight workers", async () => {
        const started: number[] = [];
        const settled: number[] = [];

        const promise = mapWithConcurrency(
            Array.from({ length: 10 }, (_, index) => index),
            2,
            async (item) => {
                started.push(item);

                if (item === 0) {
                    throw new Error("part 0 failed");
                }

                await Bun.sleep(5);
                settled.push(item);
            },
        );

        await expect(promise).rejects.toThrow("part 0 failed");
        // Only the worker already running alongside the failed one starts.
        expect(started).toEqual([0, 1]);
        expect(settled).toEqual([1]);
    });

    test("rethrows the first failure when several workers fail", async () => {
        const promise = mapWithConcurrency(
            [5, 1],
            2,
            async (delayMs) => {
                await Bun.sleep(delayMs);
                throw new Error(`failed after ${delayMs}ms`);
            },
        );

        await expect(promise).rejects.toThrow("failed after 1ms");
    });
});
