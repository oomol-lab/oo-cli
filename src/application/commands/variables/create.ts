import type { CliCommandDefinition } from "../../contracts/cli.ts";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { writeLine } from "../shared/output.ts";
import { teamIdentityInputShape, teamIdentityOptions } from "../team/identity.ts";
import {
    mapVariablesInputError,
    putVariable,
    resolveVariablesIdentity,
    resolveVariableValue,
    variableNameSchema,
} from "./shared.ts";

interface VariablesCreateInput {
    name: string;
    value?: string;
    fromFile?: string;
    stdin?: boolean;
    team?: string;
    personal?: boolean;
}

export const variablesCreateCommand: CliCommandDefinition<VariablesCreateInput> = {
    name: "create",
    aliases: ["update"],
    summaryKey: "commands.variables.create.summary",
    descriptionKey: "commands.variables.create.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "name",
            descriptionKey: "arguments.variableName",
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
        ...teamIdentityOptions({
            personal: "options.variablesPersonal",
            team: "options.variablesTeam",
        }),
    ],
    output: "standard",
    inputSchema: z.object({
        ...teamIdentityInputShape,
        name: variableNameSchema,
        value: z.string().optional(),
        fromFile: z.string().optional(),
        stdin: z.boolean().optional(),
    }),
    mapInputError: mapVariablesInputError,
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        const identity = await resolveVariablesIdentity(input, account, context);
        const value = await resolveVariableValue(input, context);
        const variable = await putVariable(account, identity, input.name, value, context);

        context.output.emit(variable, () => {
            writeLine(context.stdout, context.translator.t("variables.create.success", {
                name: variable.name,
                updatedAt: variable.updatedAt,
            }));
        });
    },
};
