import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { cloudTaskListCommand } from "./list.ts";
import { cloudTaskLogCommand } from "./log.ts";
import { cloudTaskResultCommand } from "./result.ts";
import { cloudTaskRunCommand } from "./run.ts";

export const cloudTaskCommand: CliCommandDefinition = {
    name: "cloud-task",
    summaryKey: "commands.cloudTask.summary",
    descriptionKey: "commands.cloudTask.description",
    children: [
        cloudTaskRunCommand,
        cloudTaskResultCommand,
        cloudTaskLogCommand,
        cloudTaskListCommand,
    ],
};
