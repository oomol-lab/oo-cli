import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { uninstallManagedSkill } from "./shared.ts";

const bundledSkillName = "oo" as const;

interface SkillsUninstallInput {
    skill?: string;
}

export const skillsUninstallCommand: CliCommandDefinition<SkillsUninstallInput> = {
    name: "uninstall",
    aliases: ["remove"],
    summaryKey: "commands.skills.uninstall.summary",
    descriptionKey: "commands.skills.uninstall.description",
    arguments: [
        {
            name: "skill",
            descriptionKey: "arguments.skill",
            required: false,
        },
    ],
    inputSchema: z.object({
        skill: z.string().optional(),
    }),
    handler: async (input, context) => {
        await uninstallManagedSkill(input.skill ?? bundledSkillName, context);
    },
};
