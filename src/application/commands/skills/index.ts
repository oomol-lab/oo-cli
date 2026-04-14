import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { skillsInstallCommand } from "./install.ts";
import { skillsListCommand } from "./list.ts";
import { skillsSearchCommand } from "./search.ts";
import { skillsUninstallCommand } from "./uninstall.ts";
import { skillsUpdateCommand } from "./update.ts";

export const skillsCommand: CliCommandDefinition = {
    name: "skills",
    summaryKey: "commands.skills.summary",
    descriptionKey: "commands.skills.description",
    children: [
        skillsSearchCommand,
        skillsListCommand,
        skillsInstallCommand,
        skillsUpdateCommand,
        skillsUninstallCommand,
    ],
};
