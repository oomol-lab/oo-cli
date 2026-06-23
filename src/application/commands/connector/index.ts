import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { connectorAppsCommand } from "./apps.ts";
import { connectorProxyCommand } from "./proxy.ts";
import { connectorRunCommand } from "./run.ts";
import { connectorSchemaCommand } from "./schema.ts";
import { connectorSearchCommand } from "./search.ts";

export const connectorCommand: CliCommandDefinition = {
    name: "connector",
    summaryKey: "commands.connector.summary",
    descriptionKey: "commands.connector.description",
    children: [
        connectorSearchCommand,
        connectorSchemaCommand,
        connectorRunCommand,
        connectorProxyCommand,
        connectorAppsCommand,
    ],
};
