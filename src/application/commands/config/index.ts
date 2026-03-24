import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { configGetCommand } from "./get.ts";
import { configListCommand } from "./list.ts";
import { configPathCommand } from "./path.ts";
import { configSetCommand } from "./set.ts";
import { configUnsetCommand } from "./unset.ts";

export const configCommand: CliCommandDefinition = {
    name: "config",
    summaryKey: "commands.config.summary",
    descriptionKey: "commands.config.description",
    children: [
        configListCommand,
        configGetCommand,
        configPathCommand,
        configSetCommand,
        configUnsetCommand,
    ],
};
