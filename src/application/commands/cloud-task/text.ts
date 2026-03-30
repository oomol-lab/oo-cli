import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

import type {
    CloudTaskListResponse,
    CloudTaskResultResponse,
    CloudTaskStatus,
} from "./shared.ts";
import { createWriterColors } from "../../terminal-colors.ts";

const cloudTaskPackageColor = "#59F78D";
const cloudTaskBlockColor = "#CAA8FA";
const cloudTaskUrlColor = "#7CC7FF";

type CloudTaskTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

export function formatCloudTaskResultAsText(
    taskId: string,
    response: CloudTaskResultResponse,
    context: CloudTaskTextContext,
): string {
    return formatCloudTaskResultLines(taskId, response, context).join("\n");
}

export function formatCloudTaskWaitUpdateAsText(
    taskId: string,
    response: Extract<
        CloudTaskResultResponse,
        {
            status: "queued" | "running" | "scheduled" | "scheduling";
        }
    >,
    elapsedMs: number,
    context: CloudTaskTextContext,
): string {
    return [
        context.translator.t("cloudTask.text.waitingForCompletion", {
            elapsed: formatCloudTaskDuration(elapsedMs),
        }),
        ...formatCloudTaskResultLines(taskId, response, context, {
            hideZeroProgress: true,
        }),
    ].join("\n");
}

function formatCloudTaskResultLines(
    taskId: string,
    response: CloudTaskResultResponse,
    context: CloudTaskTextContext,
    options: {
        hideZeroProgress?: boolean;
    } = {},
): string[] {
    const colors = createCloudTaskColors(context);
    const lines = [readCloudTaskHeading(response.status, context, colors)];

    lines.push(
        formatCloudTaskDetailLine(
            context.translator.t("cloudTask.text.taskId"),
            colors.bold(taskId),
            colors,
        ),
    );

    switch (response.status) {
        case "queued":
        case "scheduling":
        case "scheduled":
        case "running":
            if (!(options.hideZeroProgress === true && response.progress === 0)) {
                lines.push(
                    formatCloudTaskDetailLine(
                        context.translator.t("cloudTask.text.progress"),
                        formatCloudTaskProgress(
                            response.progress,
                            response.status,
                            colors,
                        ),
                        colors,
                    ),
                );
            }
            break;
        case "success":
            if (response.resultURL) {
                lines.push(
                    formatCloudTaskDetailLine(
                        context.translator.t("cloudTask.text.resultUrl"),
                        colors.hex(cloudTaskUrlColor)(response.resultURL),
                        colors,
                    ),
                );
            }

            if (response.resultData !== undefined) {
                lines.push(
                    formatCloudTaskDataBlock(
                        context.translator.t("cloudTask.text.resultData"),
                        response.resultData,
                        colors,
                    ),
                );
            }
            break;
        case "failed":
            if (response.error) {
                lines.push(
                    formatCloudTaskDetailLine(
                        context.translator.t("cloudTask.text.error"),
                        colors.red(response.error),
                        colors,
                    ),
                );
            }
            break;
    }

    return lines;
}

export function formatCloudTaskListAsText(
    response: CloudTaskListResponse,
    context: CloudTaskTextContext,
): string {
    const colors = createCloudTaskColors(context);
    const taskBlocks = response.tasks.map(task =>
        formatCloudTaskListTask(task, context, colors),
    );

    if (response.nextToken !== null) {
        taskBlocks.push(
            formatCloudTaskDetailLine(
                context.translator.t("cloudTask.text.nextToken"),
                colors.bold(response.nextToken),
                colors,
            ),
        );
    }

    return taskBlocks.join("\n\n");
}

function formatCloudTaskListTask(
    task: CloudTaskListResponse["tasks"][number],
    context: CloudTaskTextContext,
    colors: TerminalColors,
): string {
    const t = context.translator.t.bind(context.translator);
    const detail = (key: string, value: string): string =>
        formatCloudTaskDetailLine(t(key), value, colors);

    const lines = [
        readCloudTaskHeading(task.status, context, colors),
        detail("cloudTask.text.taskId", colors.bold(task.taskID)),
        detail("cloudTask.text.packageBlock", readCloudTaskPackageBlock(task, colors)),
        detail("cloudTask.text.workload", task.workload),
        detail("cloudTask.text.progress", formatCloudTaskProgress(task.progress, task.status, colors)),
        detail("cloudTask.text.createdAt", formatCloudTaskTimestamp(task.createdAt)),
        detail("cloudTask.text.updatedAt", formatCloudTaskTimestamp(task.updatedAt)),
    ];

    if (Object.hasOwn(task.schedulerPayload, "inputValues")) {
        lines.push(
            formatCloudTaskDataBlock(
                t("cloudTask.text.inputValues"),
                task.schedulerPayload.inputValues,
                colors,
            ),
        );
    }

    if (task.resultURL) {
        lines.push(detail("cloudTask.text.resultUrl", colors.hex(cloudTaskUrlColor)(task.resultURL)));
    }

    if (task.failedMessage) {
        lines.push(detail("cloudTask.text.error", colors.red(task.failedMessage)));
    }

    return lines.join("\n");
}

function readCloudTaskHeading(
    status: CloudTaskStatus,
    context: CloudTaskTextContext,
    colors: TerminalColors,
): string {
    const icon = colorizeCloudTaskByStatus(
        readCloudTaskStatusIcon(status),
        status,
        colors,
    );
    const label = colorizeCloudTaskByStatus(
        colors.bold(context.translator.t(`cloudTask.status.${status}`)),
        status,
        colors,
    );

    return `${icon} ${label}`;
}

function readCloudTaskStatusIcon(
    status: CloudTaskStatus,
): string {
    switch (status) {
        case "queued":
        case "scheduling":
        case "scheduled":
            return "○";
        case "running":
            return "▶";
        case "success":
            return "✓";
        case "failed":
            return "X";
    }
}

function formatCloudTaskDetailLine(
    label: string,
    value: string,
    colors: TerminalColors,
): string {
    const prefix = `  ${colors.dim(formatCloudTaskLabel(label))} `;

    return prefix + value.split("\n").join("\n    ");
}

function formatCloudTaskDataBlock(
    label: string,
    value: unknown,
    colors: TerminalColors,
): string {
    const json = JSON.stringify(value, null, 2);

    if (json === undefined) {
        return `  ${colors.dim(formatCloudTaskLabel(label))}`;
    }

    const lines = json.split("\n");

    return [
        `  ${colors.dim(formatCloudTaskLabel(label))}`,
        ...lines.map(line => `    ${line}`),
    ].join("\n");
}

function readCloudTaskPackageBlock(
    task: CloudTaskListResponse["tasks"][number],
    colors: TerminalColors,
): string {
    const packageId = task.packageID
        ? colors.hex(cloudTaskPackageColor)(task.packageID)
        : colors.dim("-");
    const blockName = colors.hex(cloudTaskBlockColor)(task.blockName);

    return `${packageId} / ${blockName}`;
}

function formatCloudTaskProgress(
    progress: number,
    status: CloudTaskStatus,
    colors: TerminalColors,
): string {
    const normalizedProgress = Math.max(0, Math.min(100, Math.round(progress)));
    const filledSlots = Math.round(normalizedProgress / 10);
    const bar = `[${"=".repeat(filledSlots)}${"-".repeat(10 - filledSlots)}]`;
    const colorizedBar = colorizeCloudTaskByStatus(bar, status, colors);

    return `${colorizedBar} ${normalizedProgress}%`;
}

function formatCloudTaskTimestamp(timestamp: number): string {
    return new Date(timestamp).toISOString();
}

export function formatCloudTaskDuration(durationMs: number): string {
    const totalSeconds = Math.max(0, Math.round(durationMs / 1_000));
    const hours = Math.floor(totalSeconds / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    const parts: string[] = [];

    if (hours > 0) {
        parts.push(`${hours}h`);
    }

    if (minutes > 0) {
        parts.push(`${minutes}m`);
    }

    if (seconds > 0 || parts.length === 0) {
        parts.push(`${seconds}s`);
    }

    return parts.join(" ");
}

function colorizeCloudTaskByStatus(
    value: string,
    status: CloudTaskStatus,
    colors: TerminalColors,
): string {
    switch (status) {
        case "queued":
        case "scheduling":
        case "scheduled":
            return colors.yellow(value);
        case "running":
            return colors.blue(value);
        case "success":
            return colors.green(value);
        case "failed":
            return colors.red(value);
    }
}

function createCloudTaskColors(
    context: Pick<CliExecutionContext, "stdout">,
): TerminalColors {
    return createWriterColors(context.stdout);
}

function formatCloudTaskLabel(label: string): string {
    if (label.endsWith(":") || label.endsWith("：")) {
        return label;
    }

    return `${label}:`;
}
