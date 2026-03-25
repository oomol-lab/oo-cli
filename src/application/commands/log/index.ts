import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { logPathCommand } from "./path.ts";
import { logPrintCommand } from "./print.ts";

export const logCommand: CliCommandDefinition = {
    name: "log",
    summaryKey: "commands.log.summary",
    descriptionKey: "commands.log.description",
    children: [
        logPathCommand,
        logPrintCommand,
    ],
};
