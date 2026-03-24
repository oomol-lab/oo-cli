import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import {
    createCloudTaskTaskUrl,
    parseCloudTaskFormat,
    parseCloudTaskResultResponse,
    requestCloudTask,
    requireCurrentCloudTaskAccount,
} from "./shared.ts";
import { formatCloudTaskResultAsText } from "./text.ts";

interface CloudTaskResultInput {
    format?: string;
    taskId: string;
}

export const cloudTaskResultCommand: CliCommandDefinition<CloudTaskResultInput> = {
    name: "result",
    summaryKey: "commands.cloudTask.result.summary",
    descriptionKey: "commands.cloudTask.result.description",
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
            name: "format",
            longFlag: "--format",
            valueName: "format",
            descriptionKey: "options.format",
        },
    ],
    inputSchema: z.object({
        format: z.string().optional(),
        taskId: z.string(),
    }),
    handler: async (input, context) => {
        const format = parseCloudTaskFormat(input.format);
        const account = await requireCurrentCloudTaskAccount(context);
        const response = parseCloudTaskResultResponse(
            await requestCloudTask(
                createCloudTaskTaskUrl(account.endpoint, input.taskId, "result"),
                account.apiKey,
                context,
            ),
        );

        if (format === "json") {
            context.stdout.write(JSON.stringify(response));
            return;
        }

        context.stdout.write(
            `${formatCloudTaskResultAsText(input.taskId, response, context)}\n`,
        );
    },
};
