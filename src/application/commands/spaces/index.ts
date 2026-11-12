import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { accessCommand } from "./access.ts";
import { deploySpaceCommands } from "./deploy.ts";
import { envCommand } from "./env.ts";
import { manageSpaceCommands } from "./manage.ts";
import { usageCommand } from "./usage.ts";

export const spacesCommand: CliCommandDefinition = {
    name: "spaces",
    summaryKey: "commands.spaces.summary",
    descriptionKey: "commands.spaces.description",
    children: [...manageSpaceCommands, ...deploySpaceCommands, envCommand, accessCommand, usageCommand],
};
