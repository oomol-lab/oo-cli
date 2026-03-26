import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { fileCleanupCommand } from "./cleanup.ts";
import { fileListCommand } from "./list.ts";
import { fileUploadCommand } from "./upload.ts";

export const fileCommand: CliCommandDefinition = {
    name: "file",
    summaryKey: "commands.file.summary",
    descriptionKey: "commands.file.description",
    children: [
        fileUploadCommand,
        fileListCommand,
        fileCleanupCommand,
    ],
};
