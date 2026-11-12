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
// its id so the caller can keep polling.
export async function waitForJob(
    client: SpacesClient,
    space: string,
    initial: SpaceJob,
    options: WaitOptions,
): Promise<SpaceJob> {
    const sleep = options.sleep ?? Bun.sleep;
    const now = options.now ?? Date.now;
    const startedAt = now();
    let job = initial;

    while (!isTerminalJob(job)) {
        if (now() - startedAt >= options.timeoutMs) {
            throw new CliUserError("errors.spaces.waitTimeout", 1, {
                id: job.id,
                seconds: Math.round(options.timeoutMs / 1_000),
                space,
                status: job.status,
            }, { details: { jobId: job.id, jobStatus: job.status } });
        }

        await sleep(jobPollIntervalMs);

        const previousStatus = job.status;

        job = await getJob(client, space, job.id);

        if (job.status !== previousStatus) {
            options.onUpdate?.(job);
        }
    }

    return job;
}
