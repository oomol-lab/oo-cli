import type { SpaceJob, SpacesClient } from "./api.ts";

import { describe, expect, test } from "bun:test";
import { expectCliUserError } from "../../../../__tests__/helpers.ts";
import { waitForJob } from "./wait.ts";

describe("spaces job waiting", () => {
    test("polls until the job is terminal and reports each status change once", async () => {
        const sleeps: number[] = [];
        const updates: string[] = [];
        let clock = 0;
        const finished = await waitForJob(
            createClient([createJob("running"), createJob("running"), createJob("succeeded", 3)]),
            "blog",
            createJob("queued"),
            {
                now: () => clock,
                onUpdate: update => updates.push(update.status),
                sleep: async (delayMs) => {
                    sleeps.push(delayMs);
                    clock += delayMs;
                },
                timeoutMs: 300_000,
            },
        );

        expect(finished.status).toBe("succeeded");
        expect(finished.version).toBe(3);
        expect(sleeps).toEqual([2_000, 2_000, 2_000]);
        expect(updates).toEqual(["running", "succeeded"]);
    });

    test("returns a job that is already terminal without polling", async () => {
        const finished = await waitForJob(createClient([]), "blog", createJob("failed"), { timeoutMs: 1_000 });

        expect(finished.status).toBe("failed");
    });

    test("gives up after the timeout with the job id in the details", async () => {
        let clock = 0;
        const error = await expectCliUserError(waitForJob(
            createClient([createJob("running"), createJob("running"), createJob("running")]),
            "blog",
            createJob("queued"),
            {
                now: () => clock,
                sleep: async (delayMs) => {
                    clock += delayMs;
                },
                timeoutMs: 4_000,
            },
        ));

        expect(error.key).toBe("errors.spaces.waitTimeout");
        expect(error.params).toMatchObject({ id: "job-1", seconds: 4, space: "blog", status: "running" });
        expect(error.details).toEqual({ jobId: "job-1", jobStatus: "running" });
    });

    test("gives the pause and the poll only what is left of the timeout", async () => {
        const sleeps: number[] = [];
        const budgets: (number | undefined)[] = [];
        let clock = 0;
        const error = await expectCliUserError(waitForJob(
            {
                request: async (request) => {
                    budgets.push(request.timeoutMs);
                    clock += 500;

                    return request.schema.parse(createJob("running"));
                },
            },
            "blog",
            createJob("queued"),
            {
                now: () => clock,
                sleep: async (delayMs) => {
                    sleeps.push(delayMs);
                    clock += delayMs;
                },
                timeoutMs: 3_000,
            },
        ));

        expect(error.key).toBe("errors.spaces.waitTimeout");
        expect(sleeps).toEqual([2_000, 500]);
        expect(budgets).toEqual([1_000]);
    });

    test("reports a poll cut short by the deadline as the wait running out", async () => {
        let clock = 0;
        const options = {
            now: () => clock,
            sleep: async (delayMs: number) => {
                clock += delayMs;
            },
            timeoutMs: 5_000,
        };
        const slow = await expectCliUserError(waitForJob(
            {
                request: async () => {
                    clock += 3_000;

                    throw new Error("The operation timed out.");
                },
            },
            "blog",
            createJob("queued"),
            options,
        ));

        expect(slow.key).toBe("errors.spaces.waitTimeout");
        expect(slow.details).toEqual({ jobId: "job-1", jobStatus: "queued" });

        clock = 0;

        // A poll that fails with time to spare is a failed request.
        await expect(waitForJob(
            {
                request: async () => {
                    throw new Error("boom");
                },
            },
            "blog",
            createJob("queued"),
            options,
        )).rejects.toThrow("boom");
    });
});

function createJob(status: SpaceJob["status"], version: number | null = null): SpaceJob {
    return {
        attempt: 1,
        createdAt: 1,
        error: status === "failed" ? "boom" : null,
        finishedAt: null,
        id: "job-1",
        kind: "deploy",
        startedAt: null,
        status,
        version,
    };
}

// Answers each poll with the next job of the sequence.
function createClient(sequence: SpaceJob[]): SpacesClient {
    return {
        request: async request => request.schema.parse(sequence.shift()),
    };
}
