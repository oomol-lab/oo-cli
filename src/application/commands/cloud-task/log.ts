import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import {
    createCloudTaskTaskUrl,
    parseCloudTaskFormat,
    parseCloudTaskLogResponse,
    parsePositiveIntegerOption,
    requestCloudTask,
} from "./shared.ts";

interface CloudTaskLogInput {
    format?: string;
    page?: string;
    taskId: string;
}

export const cloudTaskLogCommand: CliCommandDefinition<CloudTaskLogInput> = {
    name: "log",
    summaryKey: "commands.cloudTask.log.summary",
    descriptionKey: "commands.cloudTask.log.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "taskId",
            descriptionKey: "arguments.taskId",
            required: true,
        },
    ],
    options: [
        ...jsonOutputOptions,
        {
            name: "page",
            longFlag: "--page",
            valueName: "page",
            descriptionKey: "options.page",
        },
    ],
    inputSchema: z.object({
        format: z.string().optional(),
        page: z.string().optional(),
        taskId: z.string(),
    }),
    handler: async (input, context) => {
        const format = parseCloudTaskFormat(input.format);
        const page = parsePositiveIntegerOption(
            input.page,
            "errors.cloudTaskLog.invalidPage",
            {
                min: 1,
                optionName: "--page",
            },
        );
        const account = await requireCurrentAccount(context);
        const requestUrl = createCloudTaskTaskUrl(
            account.endpoint,
            input.taskId,
            "logs",
        );

        if (page !== undefined) {
            requestUrl.searchParams.set("page", String(page));
        }

        const response = parseCloudTaskLogResponse(
            await requestCloudTask(requestUrl, account.apiKey, context),
        );

        if (format === "json") {
            writeJsonOutput(context.stdout, response);
            return;
        }

        if (response.logs.length === 0) {
            context.stdout.write(
                `${context.translator.t("cloudTask.text.noLogs")}\n`,
            );
            return;
        }

        context.stdout.write(
            `${response.logs.map(log => JSON.stringify(log)).join("\n")}\n`,
        );
    },
};
