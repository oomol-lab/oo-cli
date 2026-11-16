import type { BackendDeploy, SpaceJob, SpacesClient } from "./api.ts";

import { CliUserError } from "../../contracts/cli.ts";
import { getBackendDeploy, getJob, isPendingBackendDeploy, isTerminalJob } from "./api.ts";

const jobPollIntervalMs = 2_000;
// The budget of a poll and the clock read here can disagree by a timer tick.
const deadlineSlackMs = 50;
export const defaultWaitTimeoutMs = 5 * 60_000;

interface WaitOptions<Item = SpaceJob> {
    now?: () => number;
    onUpdate?: (item: Item) => void;
    sleep?: (delayMs: number) => Promise<unknown>;
    timeoutMs: number;
}

// The polling loop shared by jobs and backend deploys. The timeout bounds the
// whole wait: the pause before a poll and the poll itself only get what is
// left of it.
async function pollUntilSettled<Item extends { status: string }>(
    initial: Item,
    options: WaitOptions<Item> & {
        isSettled: (item: Item) => boolean;
        poll: (item: Item, budgetMs: number) => Promise<Item>;
        timeoutError: (item: Item) => CliUserError;
    },
): Promise<Item> {
    const sleep = options.sleep ?? Bun.sleep;
    const now = options.now ?? Date.now;
    const startedAt = now();
    const remainingMs = (): number => options.timeoutMs - (now() - startedAt);
    let item = initial;

    while (!options.isSettled(item)) {
        if (remainingMs() <= 0) {
            throw options.timeoutError(item);
        }

        await sleep(Math.min(jobPollIntervalMs, remainingMs()));

        const budgetMs = remainingMs();

        if (budgetMs <= 0) {
            continue;
        }

        const previous = item;

        try {
            item = await options.poll(item, budgetMs);
        }
        catch (error) {
            // A poll cut short by the deadline is the wait running out, not a
            // failed request.
            if (remainingMs() <= deadlineSlackMs) {
                throw options.timeoutError(previous);
            }

            throw error;
        }

        if (item.status !== previous.status) {
            options.onUpdate?.(item);
        }
    }

    return item;
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
    return await pollUntilSettled(initial, {
        ...options,
        isSettled: isTerminalJob,
        poll: async (job, budgetMs) => await getJob(client, space, job.id, budgetMs),
        timeoutError: job => createWaitTimeoutError(job, space, options.timeoutMs),
    });
}

// Polls a backend deploy until it is live or has ended without taking effect.
// One that outlasts the timeout keeps running on the service.
export async function waitForBackendDeploy(
    client: SpacesClient,
    space: string,
    initial: BackendDeploy,
    options: WaitOptions<BackendDeploy>,
): Promise<BackendDeploy> {
    return await pollUntilSettled(initial, {
        ...options,
        isSettled: deploy => !isPendingBackendDeploy(deploy),
        poll: async (deploy, budgetMs) => await getBackendDeploy(client, space, deploy.id, budgetMs),
        timeoutError: deploy => new CliUserError("errors.spaces.backendWaitTimeout", 1, {
            id: deploy.id,
            seconds: Math.round(options.timeoutMs / 1_000),
            status: deploy.status,
        }, { details: { backendDeployId: deploy.id, backendDeployStatus: deploy.status } }),
    });
}

function createWaitTimeoutError(job: SpaceJob, space: string, timeoutMs: number): CliUserError {
    return new CliUserError("errors.spaces.waitTimeout", 1, {
        id: job.id,
        seconds: Math.round(timeoutMs / 1_000),
        space,
        status: job.status,
    }, { details: { jobId: job.id, jobStatus: job.status } });
}
