import type { CliCommandDefinition } from "../../contracts/cli.ts";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { writeLine } from "../shared/output.ts";
import { listVariables } from "./shared.ts";
import { formatVariableListLine } from "./text.ts";

export const variablesListCommand: CliCommandDefinition = {
    name: "list",
    summaryKey: "commands.variables.list.summary",
    descriptionKey: "commands.variables.list.description",
    output: "standard",
    inputSchema: z.object({}),
    handler: async (_input, context) => {
        const { account } = await requireIdentity(context);
        const variables = await listVariables(account, context);

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
