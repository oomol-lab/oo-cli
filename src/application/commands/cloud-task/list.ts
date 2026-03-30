import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import {
    createCloudTaskTasksUrl,
    parseCloudTaskFormat,
    parseCloudTaskListResponse,
    parseCloudTaskStatus,
    parsePositiveIntegerOption,
    requestCloudTask,
    requireCurrentCloudTaskAccount,
} from "./shared.ts";
import { formatCloudTaskListAsText } from "./text.ts";

interface CloudTaskListInput {
    blockId?: string;
    blockName?: string;
    format?: string;
    nextToken?: string;
    packageId?: string;
    packageName?: string;
    size?: string;
    status?: string;
}

export const cloudTaskListCommand: CliCommandDefinition<CloudTaskListInput> = {
    name: "list",
    summaryKey: "commands.cloudTask.list.summary",
    descriptionKey: "commands.cloudTask.list.description",
    options: [
        ...jsonOutputOptions,
        {
            name: "size",
            longFlag: "--size",
            valueName: "size",
            descriptionKey: "options.size",
        },
        {
            name: "nextToken",
            longFlag: "--nextToken",
            valueName: "nextToken",
            descriptionKey: "options.nextToken",
        },
        {
            name: "status",
            longFlag: "--status",
            valueName: "status",
            descriptionKey: "options.status",
        },
        {
            name: "packageId",
            longFlag: "--package-id",
            valueName: "package-id",
            descriptionKey: "options.packageId",
        },
        {
            name: "packageName",
            longFlag: "--package-name",
            valueName: "package-name",
            descriptionKey: "options.packageName",
        },
        {
            name: "blockId",
            longFlag: "--block-id",
            valueName: "block-id",
            descriptionKey: "options.blockId",
        },
        {
            name: "blockName",
            longFlag: "--block-name",
            valueName: "block-name",
            descriptionKey: "options.blockName",
        },
    ],
    inputSchema: z.object({
        blockId: z.string().optional(),
        blockName: z.string().optional(),
        format: z.string().optional(),
        nextToken: z.string().optional(),
        packageId: z.string().optional(),
        packageName: z.string().optional(),
        size: z.string().optional(),
        status: z.string().optional(),
    }),
    handler: async (input, context) => {
        const format = parseCloudTaskFormat(input.format);
        const size = parsePositiveIntegerOption(
            input.size,
            "errors.cloudTaskList.invalidSize",
            {
                max: 100,
                min: 1,
                optionName: "--size",
            },
        );
        const status = parseCloudTaskStatus(input.status);
        const packageId = resolveAliasOption({
            aliasValue: input.packageName,
            primaryOption: "--package-id",
            primaryValue: input.packageId,
            secondaryOption: "--package-name",
        });
        const blockId = resolveAliasOption({
            aliasValue: input.blockName,
            primaryOption: "--block-id",
            primaryValue: input.blockId,
            secondaryOption: "--block-name",
        });

        if (blockId !== undefined && packageId === undefined) {
            throw new CliUserError("errors.cloudTaskList.blockIdRequiresPackageId", 2);
        }

        const account = await requireCurrentCloudTaskAccount(context);
        const requestUrl = createCloudTaskTasksUrl(account.endpoint);

        if (size !== undefined) {
            requestUrl.searchParams.set("size", String(size));
        }

        if (input.nextToken?.trim()) {
            requestUrl.searchParams.set("nextToken", input.nextToken.trim());
        }

        if (status !== undefined) {
            requestUrl.searchParams.set("status", status);
        }

        if (packageId !== undefined) {
            requestUrl.searchParams.set("packageID", packageId);
        }

        if (blockId !== undefined) {
            requestUrl.searchParams.set("blockName", blockId);
        }

        const response = parseCloudTaskListResponse(
            await requestCloudTask(requestUrl, account.apiKey, context),
        );

        if (format === "json") {
            writeJsonOutput(context.stdout, response);
            return;
        }

        if (response.tasks.length === 0) {
            context.stdout.write(
                `${context.translator.t("cloudTask.text.noTasks")}\n`,
            );
            return;
        }

        context.stdout.write(`${formatCloudTaskListAsText(response, context)}\n`);
    },
};

function resolveAliasOption(options: {
    aliasValue?: string;
    primaryOption: string;
    primaryValue?: string;
    secondaryOption: string;
}): string | undefined {
    const primaryValue = normalizeOptionValue(options.primaryValue);
    const aliasValue = normalizeOptionValue(options.aliasValue);

    if (primaryValue === undefined) {
        return aliasValue;
    }

    if (aliasValue === undefined || primaryValue === aliasValue) {
        return primaryValue;
    }

    throw new CliUserError("errors.cloudTaskList.conflictingOptionValues", 2, {
        left: options.primaryOption,
        right: options.secondaryOption,
    });
}

function normalizeOptionValue(value: string | undefined): string | undefined {
    const trimmed = value?.trim();

    return trimmed || undefined;
}
