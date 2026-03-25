import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { withRequestTarget } from "../../logging/log-fields.ts";
import { readCurrentAuth } from "../auth/shared.ts";

export const cloudTaskFormatValues = ["json"] as const;
export const cloudTaskStatusValues = [
    "queued",
    "scheduling",
    "scheduled",
    "running",
    "success",
    "failed",
] as const;

const cloudTaskCreateResponseSchema = z.object({
    taskID: z.string().min(1),
}).passthrough();

const cloudTaskResultInProgressSchema = z.object({
    progress: z.number(),
    status: z.enum(["queued", "scheduling", "scheduled", "running"]),
}).passthrough();

const cloudTaskResultSuccessSchema = z.object({
    resultData: z.unknown().optional(),
    resultURL: z.string().nullable().optional(),
    status: z.literal("success"),
}).passthrough();

const cloudTaskResultFailedSchema = z.object({
    error: z.string().nullable().optional(),
    status: z.literal("failed"),
}).passthrough();

const cloudTaskLogResponseSchema = z.object({
    logs: z.array(z.record(z.string(), z.string())),
}).passthrough();

const cloudTaskListTaskSchema = z.object({
    createdAt: z.number(),
    endTime: z.number().nullable(),
    failedMessage: z.string().nullable(),
    ownerID: z.string(),
    packageID: z.string().nullable(),
    blockName: z.string(),
    progress: z.number(),
    resultURL: z.string().nullable(),
    schedulerPayload: z.record(z.string(), z.unknown()),
    startTime: z.number().nullable(),
    status: z.enum(cloudTaskStatusValues),
    subscriptionID: z.string().nullable(),
    taskID: z.string(),
    taskType: z.enum(["user", "shared"]),
    updatedAt: z.number(),
    workload: z.enum(["serverless", "applet", "api_applet", "web_task"]),
    workloadID: z.string(),
}).passthrough();

const cloudTaskListResponseSchema = z.object({
    nextToken: z.string().nullable(),
    tasks: z.array(cloudTaskListTaskSchema),
}).passthrough();

export type CloudTaskFormat = (typeof cloudTaskFormatValues)[number];
export type CloudTaskStatus = (typeof cloudTaskStatusValues)[number];
export type CloudTaskCreateResponse = z.output<typeof cloudTaskCreateResponseSchema>;
export type CloudTaskResultResponse = z.output<
    typeof cloudTaskResultInProgressSchema
    | typeof cloudTaskResultSuccessSchema
    | typeof cloudTaskResultFailedSchema
>;
export type CloudTaskLogResponse = z.output<typeof cloudTaskLogResponseSchema>;
export type CloudTaskListResponse = z.output<typeof cloudTaskListResponseSchema>;

export async function requireCurrentCloudTaskAccount(
    context: CliExecutionContext,
): Promise<AuthAccount> {
    const { authFile, currentAccount } = await readCurrentAuth(context);

    if (currentAccount !== undefined) {
        return currentAccount;
    }

    throw new CliUserError(
        authFile.id === ""
            ? "errors.cloudTask.authRequired"
            : "errors.cloudTask.activeAccountMissing",
        1,
    );
}

export function parseCloudTaskFormat(
    value: string | undefined,
): CloudTaskFormat | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value === "json") {
        return value;
    }

    throw new CliUserError("errors.cloudTask.invalidFormat", 2, {
        value,
    });
}

export function parseCloudTaskStatus(
    value: string | undefined,
): CloudTaskStatus | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (cloudTaskStatusValues.includes(value as CloudTaskStatus)) {
        return value as CloudTaskStatus;
    }

    throw new CliUserError("errors.cloudTaskList.invalidStatus", 2, {
        value,
    });
}

export function parsePositiveIntegerOption(
    value: string | undefined,
    errorKey: string,
    options: {
        max?: number;
        min?: number;
        optionName: string;
    },
): number | undefined {
    if (value === undefined) {
        return undefined;
    }

    const trimmedValue = value.trim();

    if (trimmedValue === "") {
        throw new CliUserError(errorKey, 2, {
            option: options.optionName,
            value,
        });
    }

    const parsedValue = Number(trimmedValue);

    if (
        !Number.isInteger(parsedValue)
        || parsedValue < (options.min ?? 1)
        || (options.max !== undefined && parsedValue > options.max)
    ) {
        throw new CliUserError(errorKey, 2, {
            option: options.optionName,
            value,
        });
    }

    return parsedValue;
}

export function createCloudTaskTasksUrl(endpoint: string): URL {
    return new URL(`https://cloud-task.${endpoint}/v3/users/me/tasks`);
}

export function createCloudTaskTaskUrl(
    endpoint: string,
    taskId: string,
    suffix?: string,
): URL {
    return new URL(
        `https://cloud-task.${endpoint}/v3/users/me/tasks/${encodeURIComponent(taskId)}${suffix ? `/${suffix}` : ""}`,
    );
}

export async function requestCloudTask(
    requestUrl: URL,
    apiKey: string,
    context: Pick<CliExecutionContext, "fetcher" | "logger">,
    options: {
        body?: string;
        method?: string;
    } = {},
): Promise<string> {
    const requestStartedAt = Date.now();
    const method = options.method ?? "GET";

    context.logger.debug(
        {
            bodyBytes: options.body?.length ?? 0,
            hasBody: options.body !== undefined,
            method,
            ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            query: requestUrl.searchParams.toString(),
        },
        "Cloud task request started.",
    );

    try {
        const headers: Record<string, string> = {
            Authorization: apiKey,
        };

        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        const response = await context.fetcher(requestUrl, {
            body: options.body,
            headers,
            method,
        });
        const durationMs = Date.now() - requestStartedAt;

        if (!response.ok) {
            context.logger.warn(
                {
                    durationMs,
                    method,
                    ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                    status: response.status,
                },
                "Cloud task request returned a non-success status.",
            );
            throw new CliUserError("errors.cloudTask.requestFailed", 1, {
                status: response.status,
            });
        }

        context.logger.debug(
            {
                durationMs,
                method,
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
                status: response.status,
            },
            "Cloud task request completed.",
        );

        return await response.text();
    }
    catch (error) {
        if (error instanceof CliUserError) {
            throw error;
        }

        context.logger.warn(
            {
                durationMs: Date.now() - requestStartedAt,
                err: error,
                method,
                ...withRequestTarget(requestUrl.host, requestUrl.pathname),
            },
            "Cloud task request failed unexpectedly.",
        );
        throw new CliUserError("errors.cloudTask.requestError", 1, {
            message: error instanceof Error ? error.message : String(error),
        });
    }
}

export function parseCloudTaskCreateResponse(
    rawResponse: string,
): CloudTaskCreateResponse {
    return parseCloudTaskResponse(rawResponse, cloudTaskCreateResponseSchema);
}

export function parseCloudTaskResultResponse(
    rawResponse: string,
): CloudTaskResultResponse {
    return parseCloudTaskResponse(
        rawResponse,
        z.union([
            cloudTaskResultInProgressSchema,
            cloudTaskResultSuccessSchema,
            cloudTaskResultFailedSchema,
        ]),
    );
}

export function parseCloudTaskLogResponse(
    rawResponse: string,
): CloudTaskLogResponse {
    return parseCloudTaskResponse(rawResponse, cloudTaskLogResponseSchema);
}

export function parseCloudTaskListResponse(
    rawResponse: string,
): CloudTaskListResponse {
    return parseCloudTaskResponse(rawResponse, cloudTaskListResponseSchema);
}

function parseCloudTaskResponse<T>(
    rawResponse: string,
    schema: z.ZodType<T>,
): T {
    try {
        return schema.parse(JSON.parse(rawResponse) as unknown);
    }
    catch {
        throw new CliUserError("errors.cloudTask.invalidResponse", 1);
    }
}
