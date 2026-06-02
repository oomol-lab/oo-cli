import type { CliCommandDefinition } from "../../contracts/cli.ts";
import { z } from "zod";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { writeLine } from "../shared/output.ts";
import { deleteVariable, mapVariablesInputError, variableFormatValues, variableKeySchema } from "./shared.ts";

interface VariablesDeleteInput {
    key: string;
    format?: (typeof variableFormatValues)[number];
    showSchemaVersion?: boolean;
}

export const variablesDeleteCommand: CliCommandDefinition<VariablesDeleteInput> = {
    name: "delete",
    summaryKey: "commands.variables.delete.summary",
    descriptionKey: "commands.variables.delete.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "key",
            descriptionKey: "arguments.variableKey",
            required: true,
        },
    ],
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        key: variableKeySchema,
        format: z.enum(variableFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: mapVariablesInputError,
    handler: async (input, context) => {
        const account = await requireCurrentAccount(context);
        await deleteVariable(account, input.key, context);

        if (input.format === "json") {
            writeJsonOutput(context.stdout, { key: input.key, deleted: true }, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        writeLine(context.stdout, context.translator.t("variables.delete.success", {
            key: input.key,
        }));
    },
};
