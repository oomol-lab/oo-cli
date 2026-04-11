import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { resolveRequestLanguage } from "../../../i18n/locale.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { loadPackageInfo, parsePackageSpecifier } from "../package/shared.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import {
    readJsonInputValue,
    requireJsonObjectInput,
} from "../shared/json-input.ts";
import {
    createCloudTaskTasksUrl,
    parseCloudTaskCreateResponse,
    parseCloudTaskFormat,
    requestCloudTask,
} from "./shared.ts";
import { validateCloudTaskInputValues } from "./validation.ts";

interface CloudTaskRunInput {
    blockId?: string;
    data?: string;
    dryRun?: boolean;
    format?: string;
    packageSpecifier: string;
}

const cloudTaskRunDataErrorKeys = {
    dataFilePathRequired: "errors.cloudTaskRun.dataFilePathRequired",
    dataReadFailed: "errors.cloudTaskRun.dataReadFailed",
    invalidDataJson: "errors.cloudTaskRun.invalidDataJson",
} as const;

export const cloudTaskRunCommand: CliCommandDefinition<CloudTaskRunInput> = {
    name: "run",
    summaryKey: "commands.cloudTask.run.summary",
    descriptionKey: "commands.cloudTask.run.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "packageSpecifier",
            descriptionKey: "arguments.packageSpecifier",
            required: true,
        },
    ],
    options: [
        {
            name: "blockId",
            longFlag: "--block-id",
            shortFlag: "-b",
            valueName: "block-id",
            descriptionKey: "options.blockId",
        },
        {
            name: "data",
            longFlag: "--data",
            shortFlag: "-d",
            valueName: "data",
            descriptionKey: "options.data",
        },
        {
            name: "dryRun",
            longFlag: "--dry-run",
            descriptionKey: "options.dryRun",
        },
        ...jsonOutputOptions,
    ],
    inputSchema: z.object({
        blockId: z.string().optional(),
        data: z.string().optional(),
        dryRun: z.boolean().optional(),
        format: z.string().optional(),
        packageSpecifier: z.string(),
    }),
    handler: async (input, context) => {
        const format = parseCloudTaskFormat(input.format);

        if (input.blockId === undefined || input.blockId.trim() === "") {
            throw new CliUserError("errors.cloudTaskRun.blockIdRequired", 2);
        }

        const blockId = input.blockId;
        const account = await requireCurrentAccount(context);
        const packageSpecifier = parsePackageSpecifier(input.packageSpecifier, {
            errorKey: "errors.cloudTaskRun.invalidPackageSpecifier",
            requireSemver: true,
            requireVersion: true,
        });
        const inputValues = requireJsonObjectInput(
            await readJsonInputValue(
                input.data,
                context,
                cloudTaskRunDataErrorKeys,
                {},
            ),
            "errors.cloudTaskRun.invalidPayloadShape",
        );
        const packageInfo = await loadPackageInfo(
            packageSpecifier,
            account,
            resolveRequestLanguage(context.translator.locale),
            context,
        );
        const block = packageInfo.blocks.find(item => item.blockName === blockId);

        if (block === undefined) {
            throw new CliUserError("errors.cloudTaskRun.blockNotFound", 2, {
                blockId,
            });
        }

        validateCloudTaskInputValues(inputValues, block, context.translator);

        if (input.dryRun === true) {
            if (format === "json") {
                writeJsonOutput(context.stdout, {
                    dryRun: true,
                    ok: true,
                });
                return;
            }

            context.stdout.write(
                `${context.translator.t("cloudTask.text.dryRunPassed")}\n`,
            );
            return;
        }

        const response = parseCloudTaskCreateResponse(
            await requestCloudTask(
                createCloudTaskTasksUrl(account.endpoint),
                account.apiKey,
                context,
                {
                    body: JSON.stringify({
                        blockName: block.blockName,
                        inputValues,
                        packageName: packageInfo.packageName,
                        packageVersion: packageInfo.packageVersion,
                        type: "serverless",
                    }),
                    method: "POST",
                },
            ),
        );

        if (format === "json") {
            writeJsonOutput(context.stdout, response);
            return;
        }

        context.stdout.write(
            `${context.translator.t("cloudTask.text.taskId")}: ${response.taskID}\n`,
        );
    },
};
