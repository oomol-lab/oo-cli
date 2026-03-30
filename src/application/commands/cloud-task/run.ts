import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { resolveRequestLanguage } from "../../../i18n/locale.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { loadPackageInfo, parsePackageSpecifier } from "../package/shared.ts";
import { isPlainObject } from "../shared/schema-utils.ts";
import {
    createCloudTaskTasksUrl,
    parseCloudTaskCreateResponse,
    parseCloudTaskFormat,
    requestCloudTask,
    requireCurrentCloudTaskAccount,
} from "./shared.ts";
import { validateCloudTaskInputValues } from "./validation.ts";

interface CloudTaskRunInput {
    blockId?: string;
    data?: string;
    dryRun?: boolean;
    format?: string;
    packageSpecifier: string;
}

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
        const blockId = readRequiredOption(
            input.blockId,
            "errors.cloudTaskRun.blockIdRequired",
        );
        const account = await requireCurrentCloudTaskAccount(context);
        const packageSpecifier = parsePackageSpecifier(input.packageSpecifier, {
            errorKey: "errors.cloudTaskRun.invalidPackageSpecifier",
            requireSemver: true,
            requireVersion: true,
        });
        const rawInputValues = await readInputValuesSource(input.data, context);
        const inputValues = parseInputValues(rawInputValues);
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

function readRequiredOption(
    value: string | undefined,
    errorKey: string,
): string {
    if (value === undefined || value.trim() === "") {
        throw new CliUserError(errorKey, 2);
    }

    return value;
}

async function readInputValuesSource(
    value: string | undefined,
    context: Pick<CliExecutionContext, "cwd">,
): Promise<string> {
    if (value === undefined || value.trim() === "") {
        return "{}";
    }

    if (!value.startsWith("@")) {
        return value;
    }

    const relativePath = value.slice(1);

    if (relativePath.trim() === "") {
        throw new CliUserError("errors.cloudTaskRun.dataFilePathRequired", 2);
    }

    const resolvedPath = resolve(context.cwd, relativePath);

    try {
        return await readFile(resolvedPath, "utf8");
    }
    catch (error) {
        throw new CliUserError("errors.cloudTaskRun.dataReadFailed", 1, {
            message: error instanceof Error ? error.message : String(error),
            path: resolvedPath,
        });
    }
}

function parseInputValues(
    rawInputValues: string,
): Record<string, unknown> {
    const normalizedInput = rawInputValues.charCodeAt(0) === 0xFEFF
        ? rawInputValues.slice(1)
        : rawInputValues;

    try {
        const parsedValue = JSON.parse(normalizedInput) as unknown;

        if (!isPlainObject(parsedValue)) {
            throw new CliUserError("errors.cloudTaskRun.invalidPayloadShape", 2);
        }

        return parsedValue;
    }
    catch (error) {
        if (error instanceof CliUserError) {
            throw error;
        }

        throw new CliUserError("errors.cloudTaskRun.invalidDataJson", 2, {
            message: error instanceof Error ? error.message : String(error),
        });
    }
}
