import type { SpaceJob, SpacesClient } from "./api.ts";

import { CliUserError } from "../../contracts/cli.ts";
import { getJob, isTerminalJob } from "./api.ts";

const jobPollIntervalMs = 2_000;
export const defaultWaitTimeoutMs = 5 * 60_000;

interface WaitOptions {
    now?: () => number;
    onUpdate?: (job: SpaceJob) => void;
    sleep?: (delayMs: number) => Promise<unknown>;
    timeoutMs: number;
}

// Polls a deploy or rollback job until it reaches a terminal status. A job
// that outlasts the timeout keeps running on the service; the error carries
// its id so the caller can keep polling. The timeout bounds the whole wait:
// the pause before a poll and the poll itself only get what is left of it.
export async function waitForJob(
    client: SpacesClient,
    space: string,
    initial: SpaceJob,
    options: WaitOptions,
): Promise<SpaceJob> {
    const sleep = options.sleep ?? Bun.sleep;
    const now = options.now ?? Date.now;
    const startedAt = now();
    const remainingMs = (): number => options.timeoutMs - (now() - startedAt);
    let job = initial;

    while (!isTerminalJob(job)) {
        if (remainingMs() <= 0) {
            throw createWaitTimeoutError(job, space, options.timeoutMs);
        }

        await sleep(Math.min(jobPollIntervalMs, remainingMs()));

        const budgetMs = remainingMs();

        if (budgetMs <= 0) {
            continue;
        }

        const previous = job;

        try {
            job = await getJob(client, space, job.id, budgetMs);
        }
        catch (error) {
            // A poll cut short by the deadline is the wait running out, not a
            // failed request.
            if (remainingMs() <= 0) {
                throw createWaitTimeoutError(previous, space, options.timeoutMs);
            }

            throw error;
        }

        if (job.status !== previous.status) {
            options.onUpdate?.(job);
        }
    }

    return job;
}

function createWaitTimeoutError(job: SpaceJob, space: string, timeoutMs: number): CliUserError {
    return new CliUserError("errors.spaces.waitTimeout", 1, {
        id: job.id,
        seconds: Math.round(timeoutMs / 1_000),
        space,
        status: job.status,
    }, { details: { jobId: job.id, jobStatus: job.status } });
}
