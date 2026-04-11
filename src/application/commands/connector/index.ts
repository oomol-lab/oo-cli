import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { connectorRunCommand } from "./run.ts";
import { connectorSearchCommand } from "./search.ts";

export const connectorCommand: CliCommandDefinition = {
    name: "connector",
    summaryKey: "commands.connector.summary",
    descriptionKey: "commands.connector.description",
    children: [
        connectorSearchCommand,
        connectorRunCommand,
    ],
};
