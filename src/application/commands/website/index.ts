import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { websiteUploadCommand } from "./upload.ts";

export const websiteCommand: CliCommandDefinition = {
    name: "website",
    summaryKey: "commands.website.summary",
    descriptionKey: "commands.website.description",
    children: [websiteUploadCommand],
};
