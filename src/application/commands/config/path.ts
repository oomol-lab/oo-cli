import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { writeLine } from "./shared.ts";

export const configPathCommand: CliCommandDefinition = {
    name: "path",
    summaryKey: "commands.config.path.summary",
    descriptionKey: "commands.config.path.description",
    inputSchema: z.object({}),
    handler: (_, context) => {
        writeLine(context, context.settingsStore.getFilePath());
    },
};
