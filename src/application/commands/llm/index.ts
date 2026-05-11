import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { llmConfigCommand } from "./config.ts";
import { llmJsonCommand } from "./json.ts";

export const llmCommand: CliCommandDefinition = {
    name: "llm",
    summaryKey: "commands.llm.summary",
    descriptionKey: "commands.llm.description",
    children: [
        llmConfigCommand,
        llmJsonCommand,
    ],
};
