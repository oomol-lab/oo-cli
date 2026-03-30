import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { writeLine } from "../shared/output.ts";

export const configPathCommand: CliCommandDefinition = {
    name: "path",
    summaryKey: "commands.config.path.summary",
    descriptionKey: "commands.config.path.description",
    inputSchema: z.object({}),
    handler: (_, context) => {
        writeLine(context.stdout, context.settingsStore.getFilePath());
    },
};
