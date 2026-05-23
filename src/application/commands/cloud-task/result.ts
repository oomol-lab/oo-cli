import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import {
    createCloudTaskTaskUrl,
    parseCloudTaskFormat,
    parseCloudTaskResultResponse,
    requestCloudTask,
} from "./shared.ts";
import { formatCloudTaskResultAsText } from "./text.ts";

interface CloudTaskResultInput {
    format?: string;
    showSchemaVersion?: boolean;
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
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        format: z.string().optional(),
        showSchemaVersion: z.boolean().optional(),
        taskId: z.string(),
    }),
    handler: async (input, context) => {
        const format = parseCloudTaskFormat(input.format);
        const account = await requireCurrentAccount(context);
        const response = parseCloudTaskResultResponse(
            await requestCloudTask(
                createCloudTaskTaskUrl(account.endpoint, input.taskId, "result"),
                account.apiKey,
                context,
            ),
        );

        context.telemetry?.recordProperties({
            final_status: response.status,
        });

        if (format === "json") {
            writeJsonOutput(context.stdout, response, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        context.stdout.write(
            `${formatCloudTaskResultAsText(input.taskId, response, context)}\n`,
        );
    },
};
