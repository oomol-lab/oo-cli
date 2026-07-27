import type { CliCommandDefinition } from "../../contracts/cli.ts";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { writeLine } from "../shared/output.ts";
import { getVariable, mapVariablesInputError, variableFormatValues, variableNameSchema } from "./shared.ts";

interface VariablesGetInput {
    name: string;
    format?: (typeof variableFormatValues)[number];
    showSchemaVersion?: boolean;
}

export const variablesGetCommand: CliCommandDefinition<VariablesGetInput> = {
    name: "get",
    summaryKey: "commands.variables.get.summary",
    descriptionKey: "commands.variables.get.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "name",
            descriptionKey: "arguments.variableName",
            required: true,
        },
    ],
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        name: variableNameSchema,
        format: z.enum(variableFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: mapVariablesInputError,
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        const variable = await getVariable(account, input.name, context);

        if (input.format === "json") {
            writeJsonOutput(context.stdout, variable, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        writeLine(context.stdout, variable.value);
    },
};
