import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { orgClearCommand } from "./clear.ts";
import { orgCurrentCommand } from "./current.ts";
import { orgListCommand } from "./list.ts";
import { orgUseCommand } from "./use.ts";

export const orgCommand: CliCommandDefinition = {
    name: "org",
    summaryKey: "commands.org.summary",
    descriptionKey: "commands.org.description",
    children: [
        orgListCommand,
        orgCurrentCommand,
        orgUseCommand,
        orgClearCommand,
    ],
};
