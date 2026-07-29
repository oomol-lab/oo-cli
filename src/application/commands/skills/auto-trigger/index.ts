import type { CliCommandDefinition } from "../../../contracts/cli.ts";

import { skillsAutoTriggerOffCommand } from "./off.ts";
import { skillsAutoTriggerOnCommand } from "./on.ts";
import { skillsAutoTriggerStatusCommand } from "./status.ts";

export const skillsAutoTriggerCommand: CliCommandDefinition = {
    name: "auto-trigger",
    summaryKey: "commands.skills.autoTrigger.summary",
    descriptionKey: "commands.skills.autoTrigger.description",
    children: [
        skillsAutoTriggerOffCommand,
        skillsAutoTriggerOnCommand,
        skillsAutoTriggerStatusCommand,
    ],
};
