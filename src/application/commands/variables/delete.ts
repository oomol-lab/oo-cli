import type { CliCommandDefinition } from "../../contracts/cli.ts";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { outputFormatOptions, writeJsonOutput } from "../command-output.ts";
import { writeLine } from "../shared/output.ts";
import { deleteVariable, mapVariablesInputError, variableFormatValues, variableNameSchema } from "./shared.ts";

interface VariablesDeleteInput {
    name: string;
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
            name: "name",
            descriptionKey: "arguments.variableName",
            required: true,
        },
    ],
    options: [...outputFormatOptions],
    inputSchema: z.object({
        name: variableNameSchema,
        format: z.enum(variableFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: mapVariablesInputError,
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        await deleteVariable(account, input.name, context);

        if (input.format === "json") {
            writeJsonOutput(context.stdout, { name: input.name, deleted: true }, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        writeLine(context.stdout, context.translator.t("variables.delete.success", {
            name: input.name,
        }));
    },
};
