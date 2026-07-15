import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { teamClearCommand } from "./clear.ts";
import { teamCurrentCommand } from "./current.ts";
import { teamListCommand } from "./list.ts";
import { teamUseCommand } from "./use.ts";

export const teamCommand: CliCommandDefinition = {
    name: "team",
    summaryKey: "commands.team.summary",
    descriptionKey: "commands.team.description",
    children: [
        teamListCommand,
        teamCurrentCommand,
        teamUseCommand,
        teamClearCommand,
    ],
};
