import type { CliCommandDefinition } from "../../contracts/cli.ts";
import { z } from "zod";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { writeLine } from "../shared/output.ts";
import {
    mapVariablesInputError,
    putVariable,
    resolveVariableValue,
    variableFormatValues,
    variableKeySchema,
} from "./shared.ts";

interface VariablesCreateInput {
    key: string;
    value?: string;
    fromFile?: string;
    stdin?: boolean;
    format?: (typeof variableFormatValues)[number];
    showSchemaVersion?: boolean;
}

export const variablesCreateCommand: CliCommandDefinition<VariablesCreateInput> = {
    name: "create",
    aliases: ["update"],
    summaryKey: "commands.variables.create.summary",
    descriptionKey: "commands.variables.create.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "key",
            descriptionKey: "arguments.variableKey",
            required: true,
        },
        {
            name: "value",
            descriptionKey: "arguments.variableValue",
            required: false,
        },
    ],
    options: [
        {
            name: "fromFile",
            longFlag: "--from-file",
            valueName: "path",
            descriptionKey: "options.variablesFromFile",
        },
        {
            name: "stdin",
            longFlag: "--stdin",
            descriptionKey: "options.variablesStdin",
        },
        ...jsonOutputOptions,
    ],
    inputSchema: z.object({
        key: variableKeySchema,
        value: z.string().optional(),
        fromFile: z.string().optional(),
        stdin: z.boolean().optional(),
        format: z.enum(variableFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: mapVariablesInputError,
    handler: async (input, context) => {
        const account = await requireCurrentAccount(context);
        const value = await resolveVariableValue(input, context);
        const variable = await putVariable(account, input.key, value, context);

        if (input.format === "json") {
            writeJsonOutput(context.stdout, variable, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        writeLine(context.stdout, context.translator.t("variables.create.success", {
            key: variable.key,
            updatedAt: variable.updatedAt,
        }));
    },
};
