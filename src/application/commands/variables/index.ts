import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { variablesCreateCommand } from "./create.ts";
import { variablesDeleteCommand } from "./delete.ts";
import { variablesGetCommand } from "./get.ts";
import { variablesListCommand } from "./list.ts";

export const variablesCommand: CliCommandDefinition = {
    name: "variables",
    aliases: ["variable", "var", "vars"],
    summaryKey: "commands.variables.summary",
    descriptionKey: "commands.variables.description",
    children: [
        variablesListCommand,
        variablesGetCommand,
        variablesCreateCommand,
        variablesDeleteCommand,
    ],
};
