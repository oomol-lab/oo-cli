import type { CliCommandDefinition } from "../../contracts/cli.ts";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { writeLine } from "../shared/output.ts";
import { listVariables, mapVariablesInputError, variableFormatValues } from "./shared.ts";
import { formatVariableListLine } from "./text.ts";

interface VariablesListInput {
    format?: (typeof variableFormatValues)[number];
    showSchemaVersion?: boolean;
}

export const variablesListCommand: CliCommandDefinition<VariablesListInput> = {
    name: "list",
    summaryKey: "commands.variables.list.summary",
    descriptionKey: "commands.variables.list.description",
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        format: z.enum(variableFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: mapVariablesInputError,
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        const variables = await listVariables(account, context);

        if (input.format === "json") {
            writeJsonOutput(context.stdout, { variables }, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        if (variables.length === 0) {
            writeLine(context.stdout, context.translator.t("variables.list.empty"));
            return;
        }

        for (const variable of variables) {
            writeLine(context.stdout, formatVariableListLine(variable));
        }
    },
};
