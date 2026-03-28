import type { CliCommandDefinition } from "../../../contracts/cli.ts";

import { skillsConfigGetCommand } from "./get.ts";
import { skillsConfigSetCommand } from "./set.ts";

export const skillsConfigCommand: CliCommandDefinition = {
    name: "config",
    summaryKey: "commands.skills.config.summary",
    descriptionKey: "commands.skills.config.description",
    children: [
        skillsConfigGetCommand,
        skillsConfigSetCommand,
    ],
};
