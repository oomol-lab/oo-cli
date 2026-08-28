import type { CliCommandDefinition } from "../../contracts/cli.ts";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { writeLine } from "../shared/output.ts";
import { teamIdentityInputShape, teamIdentityOptions } from "../team/identity.ts";
import {
    deleteVariable,
    mapVariablesInputError,
    resolveVariablesIdentity,
    variableNameSchema,
} from "./shared.ts";

interface VariablesDeleteInput {
    name: string;
    team?: string;
    personal?: boolean;
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
    options: [
        ...teamIdentityOptions({
            personal: "options.variablesPersonal",
            team: "options.variablesTeam",
        }),
    ],
    output: "standard",
    inputSchema: z.object({
        ...teamIdentityInputShape,
        name: variableNameSchema,
    }),
    mapInputError: mapVariablesInputError,
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        const identity = await resolveVariablesIdentity(input, account, context);
        await deleteVariable(account, identity, input.name, context);

        context.output.emit({ name: input.name, deleted: true }, () => {
            writeLine(context.stdout, context.translator.t("variables.delete.success", {
                name: input.name,
            }));
        });
    },
};
