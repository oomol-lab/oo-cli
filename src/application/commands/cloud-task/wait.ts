import type {
    CliCommandDefinition,
    CliCommandHandler,
} from "../../contracts/cli.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import {
    createCloudTaskTaskUrl,
    parseCloudTaskResultResponse,
    parseDurationOption,
    requestCloudTask,
    requireCurrentCloudTaskAccount,
} from "./shared.ts";
import {
    formatCloudTaskDuration,
    formatCloudTaskResultAsText,
    formatCloudTaskWaitUpdateAsText,
} from "./text.ts";

interface CloudTaskWaitInput {
    taskId: string;
    timeout?: string;
}

export interface CloudTaskWaitDependencies {
    now: () => number;
    sleep: (durationMs: number) => Promise<void>;
}

const defaultCloudTaskWaitDependencies: CloudTaskWaitDependencies = {
    now: () => Date.now(),
    sleep: durationMs => Bun.sleep(durationMs),
};

const defaultTimeoutMs = 6 * 3_600_000;
const minTimeoutMs = 10_000;
const maxTimeoutMs = 24 * 3_600_000;
const pollIntervalMs = 3_000;
const firstWaitWindowMs = 3_600_000;
const secondWaitWindowMs = 3 * 3_600_000;
const firstWaitPrintIntervalMs = 60_000;
const secondWaitPrintIntervalMs = 3 * 60_000;
const thirdWaitPrintIntervalMs = 5 * 60_000;

export const cloudTaskWaitCommand: CliCommandDefinition<CloudTaskWaitInput> = {
    name: "wait",
    aliases: ["wati"], // Intentional typo-tolerance alias
    summaryKey: "commands.cloudTask.wait.summary",
    descriptionKey: "commands.cloudTask.wait.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "taskId",
            descriptionKey: "arguments.taskId",
            required: true,
        },
    ],
    options: [
        {
            name: "timeout",
            longFlag: "--timeout",
            valueName: "timeout",
            descriptionKey: "options.timeout",
        },
    ],
    inputSchema: z.object({
        taskId: z.string(),
        timeout: z.string().optional(),
    }),
    handler: createCloudTaskWaitHandler(),
};

export function createCloudTaskWaitHandler(
    dependencies: CloudTaskWaitDependencies = defaultCloudTaskWaitDependencies,
): CliCommandHandler<CloudTaskWaitInput> {
    return async (input, context) => {
        const timeoutMs = parseCloudTaskWaitTimeout(input.timeout);
        const account = await requireCurrentCloudTaskAccount(context);
        const requestUrl = createCloudTaskTaskUrl(
            account.endpoint,
            input.taskId,
            "result",
        );
        const startedAt = dependencies.now();
        let lastPrintedElapsedMs: number | undefined;

        while (true) {
            const elapsedBeforeRequestMs = dependencies.now() - startedAt;

            if (elapsedBeforeRequestMs >= timeoutMs) {
                throw new CliUserError("errors.cloudTaskWait.timedOut", 1, {
                    taskId: input.taskId,
                    timeout: formatCloudTaskDuration(timeoutMs),
                });
            }

            const response = parseCloudTaskResultResponse(
                await requestCloudTask(requestUrl, account.apiKey, context),
            );

            if (response.status === "success") {
                context.stdout.write(
                    `${formatCloudTaskResultAsText(input.taskId, response, context)}\n`,
                );
                return;
            }

            if (response.status === "failed") {
                context.stdout.write(
                    `${formatCloudTaskResultAsText(input.taskId, response, context)}\n`,
                );
                throw new CliUserError("errors.cloudTaskWait.failed", 1, {
                    taskId: input.taskId,
                });
            }

            const elapsedMs = dependencies.now() - startedAt;

            if (shouldPrintCloudTaskWaitUpdate(lastPrintedElapsedMs, elapsedMs)) {
                context.stdout.write(
                    `${formatCloudTaskWaitUpdateAsText(input.taskId, response, elapsedMs, context)}\n\n`,
                );
                lastPrintedElapsedMs = elapsedMs;
            }

            const remainingMs = timeoutMs - elapsedMs;

            if (remainingMs <= 0) {
                throw new CliUserError("errors.cloudTaskWait.timedOut", 1, {
                    taskId: input.taskId,
                    timeout: formatCloudTaskDuration(timeoutMs),
                });
            }

            await dependencies.sleep(Math.min(pollIntervalMs, remainingMs));
        }
    };
}

export function parseCloudTaskWaitTimeout(value: string | undefined): number {
    return parseDurationOption(
        value,
        "errors.cloudTaskWait.invalidTimeout",
        {
            defaultUnit: "s",
            maxMs: maxTimeoutMs,
            minMs: minTimeoutMs,
            optionName: "--timeout",
        },
    ) ?? defaultTimeoutMs;
}

export function shouldPrintCloudTaskWaitUpdate(
    lastPrintedElapsedMs: number | undefined,
    elapsedMs: number,
): boolean {
    if (lastPrintedElapsedMs === undefined) {
        return true;
    }

    return elapsedMs - lastPrintedElapsedMs
        >= readCloudTaskWaitPrintIntervalMs(elapsedMs);
}

export function readCloudTaskWaitPrintIntervalMs(elapsedMs: number): number {
    if (elapsedMs < firstWaitWindowMs) {
        return firstWaitPrintIntervalMs;
    }

    if (elapsedMs < secondWaitWindowMs) {
        return secondWaitPrintIntervalMs;
    }

    return thirdWaitPrintIntervalMs;
}
