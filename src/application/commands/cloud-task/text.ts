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
            lines.push(
                formatCloudTaskDetailLine(
                    context.translator.t("cloudTask.text.progress"),
                    formatCloudTaskProgress(response.progress, response.status, colors),
                    colors,
                ),
            );
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

    return lines.join("\n");
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
    const lines = [readCloudTaskHeading(task.status, context, colors)];

    lines.push(
        formatCloudTaskDetailLine(
            context.translator.t("cloudTask.text.taskId"),
            colors.bold(task.taskID),
            colors,
        ),
    );
    lines.push(
        formatCloudTaskDetailLine(
            context.translator.t("cloudTask.text.packageBlock"),
            readCloudTaskPackageBlock(task, colors),
            colors,
        ),
    );
    lines.push(
        formatCloudTaskDetailLine(
            context.translator.t("cloudTask.text.workload"),
            task.workload,
            colors,
        ),
    );
    lines.push(
        formatCloudTaskDetailLine(
            context.translator.t("cloudTask.text.progress"),
            formatCloudTaskProgress(task.progress, task.status, colors),
            colors,
        ),
    );
    lines.push(
        formatCloudTaskDetailLine(
            context.translator.t("cloudTask.text.createdAt"),
            formatCloudTaskTimestamp(task.createdAt),
            colors,
        ),
    );
    lines.push(
        formatCloudTaskDetailLine(
            context.translator.t("cloudTask.text.updatedAt"),
            formatCloudTaskTimestamp(task.updatedAt),
            colors,
        ),
    );

    if (Object.hasOwn(task.schedulerPayload, "inputValues")) {
        lines.push(
            formatCloudTaskDataBlock(
                context.translator.t("cloudTask.text.inputValues"),
                task.schedulerPayload.inputValues,
                colors,
            ),
        );
    }

    if (task.resultURL) {
        lines.push(
            formatCloudTaskDetailLine(
                context.translator.t("cloudTask.text.resultUrl"),
                colors.hex(cloudTaskUrlColor)(task.resultURL),
                colors,
            ),
        );
    }

    if (task.failedMessage) {
        lines.push(
            formatCloudTaskDetailLine(
                context.translator.t("cloudTask.text.error"),
                colors.red(task.failedMessage),
                colors,
            ),
        );
    }

    return lines.join("\n");
}

function readCloudTaskHeading(
    status: CloudTaskStatus,
    context: CloudTaskTextContext,
    colors: TerminalColors,
): string {
    return `${readCloudTaskStatusIcon(status, colors)} ${readCloudTaskStatusLabel(status, context, colors)}`;
}

function readCloudTaskStatusIcon(
    status: CloudTaskStatus,
    colors: TerminalColors,
): string {
    switch (status) {
        case "queued":
        case "scheduling":
        case "scheduled":
            return colors.yellow("○");
        case "running":
            return colors.blue("▶");
        case "success":
            return colors.green("✓");
        case "failed":
            return colors.red("X");
    }
}

function readCloudTaskStatusLabel(
    status: CloudTaskStatus,
    context: CloudTaskTextContext,
    colors: TerminalColors,
): string {
    const label = context.translator.t(`cloudTask.status.${status}`);

    switch (status) {
        case "queued":
        case "scheduling":
        case "scheduled":
            return colors.yellow.bold(label);
        case "running":
            return colors.blue.bold(label);
        case "success":
            return colors.green.bold(label);
        case "failed":
            return colors.red.bold(label);
    }
}

function formatCloudTaskDetailLine(
    label: string,
    value: string,
    colors: TerminalColors,
): string {
    const valueLines = value.split("\n");
    const firstValueLine = valueLines[0] ?? "";
    const remainingValueLines = valueLines.slice(1);
    const lines = [
        `  ${colors.dim(formatCloudTaskLabel(label))} ${firstValueLine}`,
    ];

    for (const line of remainingValueLines) {
        lines.push(`    ${line}`);
    }

    return lines.join("\n");
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
