import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { uninstallBundledSkill } from "./shared.ts";

const bundledSkillName = "oo" as const;

export const skillsUninstallCommand: CliCommandDefinition = {
    name: "uninstall",
    summaryKey: "commands.skills.uninstall.summary",
    descriptionKey: "commands.skills.uninstall.description",
    inputSchema: z.object({}),
    handler: async (_, context) => {
        await uninstallBundledSkill(bundledSkillName, context);
    },
};
