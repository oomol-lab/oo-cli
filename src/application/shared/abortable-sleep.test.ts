import { describe, expect, test } from "bun:test";

import { abortableSleep } from "./abortable-sleep.ts";

describe("abortableSleep", () => {
    test("resolves after the delay, with or without a signal", async () => {
        const startedAt = Date.now();

        await abortableSleep(20);
        await abortableSleep(20, new AbortController().signal);

        expect(Date.now() - startedAt).toBeGreaterThanOrEqual(30);
    });

    test("rejects with the signal's reason as soon as it aborts", async () => {
        const controller = new AbortController();
        const startedAt = Date.now();
        const sleeping = abortableSleep(5_000, controller.signal);

        controller.abort(new Error("cancelled"));

        await expect(sleeping).rejects.toThrow("cancelled");
        expect(Date.now() - startedAt).toBeLessThan(1_000);
    });

    test("rejects at once for a signal that is already aborted", async () => {
        await expect(abortableSleep(5_000, AbortSignal.abort(new Error("gone")))).rejects.toThrow("gone");
    });
});
