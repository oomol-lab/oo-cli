import type { CliCommandDefinition } from "../../contracts/cli.ts";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { writeLine } from "../shared/output.ts";
import { teamIdentityInputShape, teamIdentityOptions } from "../team/identity.ts";
import {
    getVariable,
    mapVariablesInputError,
    resolveVariablesIdentity,
    variableNameSchema,
} from "./shared.ts";

interface VariablesGetInput {
    name: string;
    team?: string;
    personal?: boolean;
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
        const variable = await getVariable(account, identity, input.name, context);

        context.output.emit(variable, () => {
            writeLine(context.stdout, variable.value);
        });
    },
};
