import type { CliCommandDefinition } from "../../contracts/cli.ts";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { writeLine } from "../shared/output.ts";
import {
    resolveAccountTeamIdentity,
    teamIdentityInputShape,
    teamOption,
} from "../team/identity.ts";
import { listVariables } from "./shared.ts";
import { formatVariableListLine } from "./text.ts";

interface VariablesListInput {
    team?: string;
}

export const variablesListCommand: CliCommandDefinition<VariablesListInput> = {
    name: "list",
    summaryKey: "commands.variables.list.summary",
    descriptionKey: "commands.variables.list.description",
    options: [
        teamOption("options.variablesTeam"),
    ],
    output: "standard",
    inputSchema: z.object({
        ...teamIdentityInputShape,
    }),
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        const identity = await resolveAccountTeamIdentity(input, account, context);
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
