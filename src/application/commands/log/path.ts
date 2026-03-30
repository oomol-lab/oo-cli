import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import {
    resolveCliLogDirectoryPath,
    writeLine,
} from "./shared.ts";

export const logPathCommand: CliCommandDefinition = {
    name: "path",
    summaryKey: "commands.log.path.summary",
    descriptionKey: "commands.log.path.description",
    inputSchema: z.object({}),
    handler: (_, context) => {
        writeLine(context.stdout, resolveCliLogDirectoryPath(context));
    },
};
