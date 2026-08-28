import type { CliCommandDefinition } from "../../contracts/cli.ts";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { writeLine } from "../shared/output.ts";
import {
    resolveAccountTeamIdentity,
    teamIdentityInputShape,
    teamOption,
} from "../team/identity.ts";
import {
    getVariable,
    mapVariablesInputError,
    variableNameSchema,
} from "./shared.ts";

interface VariablesGetInput {
    name: string;
    team?: string;
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
        teamOption("options.variablesTeam"),
    ],
    output: "standard",
    inputSchema: z.object({
        ...teamIdentityInputShape,
        name: variableNameSchema,
    }),
    mapInputError: mapVariablesInputError,
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        const identity = await resolveAccountTeamIdentity(input, account, context);
        const variable = await getVariable(account, identity, input.name, context);

        context.output.emit(variable, () => {
            writeLine(context.stdout, variable.value);
        });
    },
};
