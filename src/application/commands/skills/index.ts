import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { skillsAllowImplicitInvocationCommand } from "./allow-implicit-invocation.ts";
import { skillsInstallCommand } from "./install.ts";
import { skillsUninstallCommand } from "./uninstall.ts";

export const skillsCommand: CliCommandDefinition = {
    name: "skills",
    summaryKey: "commands.skills.summary",
    descriptionKey: "commands.skills.description",
    children: [
        skillsAllowImplicitInvocationCommand,
        skillsInstallCommand,
        skillsUninstallCommand,
    ],
};
