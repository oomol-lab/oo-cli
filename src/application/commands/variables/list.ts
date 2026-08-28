import type { CliCommandDefinition } from "../../contracts/cli.ts";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { writeLine } from "../shared/output.ts";
import { teamIdentityInputShape, teamIdentityOptions } from "../team/identity.ts";
import { listVariables, resolveVariablesIdentity } from "./shared.ts";
import { formatVariableListLine } from "./text.ts";

interface VariablesListInput {
    team?: string;
    personal?: boolean;
}

export const variablesListCommand: CliCommandDefinition<VariablesListInput> = {
    name: "list",
    summaryKey: "commands.variables.list.summary",
    descriptionKey: "commands.variables.list.description",
    options: [
        ...teamIdentityOptions({
            personal: "options.variablesPersonal",
            team: "options.variablesTeam",
        }),
    ],
    output: "standard",
    inputSchema: z.object({
        ...teamIdentityInputShape,
    }),
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        const identity = await resolveVariablesIdentity(input, account, context);
        const variables = await listVariables(account, identity, context);

        context.output.emit({ variables }, () => {
            if (variables.length === 0) {
                writeLine(context.stdout, context.translator.t("variables.list.empty"));
                return;
            }

            for (const variable of variables) {
                writeLine(context.stdout, formatVariableListLine(variable));
            }
        });
    },
};
