import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { packageInfoCommand } from "./info.ts";
import { packageSearchCommand } from "./search.ts";

export const packageCommand: CliCommandDefinition = {
    name: "packages",
    summaryKey: "commands.package.summary",
    descriptionKey: "commands.package.description",
    children: [
        packageSearchCommand,
        packageInfoCommand,
    ],
};
