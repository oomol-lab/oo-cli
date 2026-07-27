import type { CliCommandDefinition } from "../../contracts/cli.ts";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { writeLine } from "../shared/output.ts";
import { deleteVariable, mapVariablesInputError, variableNameSchema } from "./shared.ts";

interface VariablesDeleteInput {
    name: string;
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
    output: "standard",
    inputSchema: z.object({
        name: variableNameSchema,
    }),
    mapInputError: mapVariablesInputError,
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        await deleteVariable(account, input.name, context);

        context.output.emit({ name: input.name, deleted: true }, () => {
            writeLine(context.stdout, context.translator.t("variables.delete.success", {
                name: input.name,
            }));
        });
    },
};
