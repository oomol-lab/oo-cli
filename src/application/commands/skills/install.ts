import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { installBundledSkill } from "./shared.ts";

const bundledSkillName = "oo" as const;

export const skillsInstallCommand: CliCommandDefinition = {
    name: "install",
    summaryKey: "commands.skills.install.summary",
    descriptionKey: "commands.skills.install.description",
    inputSchema: z.object({}),
    handler: async (_, context) => {
        await installBundledSkill(bundledSkillName, context);
    },
};
