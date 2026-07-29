import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { skillsAdoptCommand } from "./adopt.ts";
import { skillsAutoTriggerCommand } from "./auto-trigger/index.ts";
import { skillsCheckUpdateCommand } from "./check-update.ts";
import { skillsCheckCommand } from "./check.ts";
import { skillsInitCommand } from "./init.ts";
import { skillsInstallCommand } from "./install.ts";
import { skillsListCommand } from "./list.ts";
import { skillsLocateCommand } from "./locate.ts";
import { skillsPublishCommand } from "./publish.ts";
import { skillsRecommendCommand } from "./recommend/index.ts";
import { skillsRepairCommand } from "./repair.ts";
import { skillsSearchCommand } from "./search.ts";
import { skillsShareCommand } from "./share.ts";
import { skillsSyncCommand } from "./sync.ts";
import { skillsUninstallCommand } from "./uninstall.ts";
import { skillsUpdateCommand } from "./update.ts";
import { skillsValidateCommand } from "./validate.ts";

export const skillsCommand: CliCommandDefinition = {
    name: "skills",
    summaryKey: "commands.skills.summary",
    descriptionKey: "commands.skills.description",
    children: [
        skillsSearchCommand,
        skillsListCommand,
        skillsLocateCommand,
        skillsSyncCommand,
        skillsCheckCommand,
        skillsInitCommand,
        skillsAdoptCommand,
        skillsValidateCommand,
        skillsPublishCommand,
        skillsShareCommand,
        skillsInstallCommand,
        skillsUpdateCommand,
        skillsUninstallCommand,
        skillsRepairCommand,
        skillsCheckUpdateCommand,
        skillsAutoTriggerCommand,
        skillsRecommendCommand,
    ],
};
