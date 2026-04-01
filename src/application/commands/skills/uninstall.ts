import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import { uninstallManagedSkill } from "./shared.ts";

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
        if (input.skill === undefined) {
            for (const skillName of availableBundledSkillNames) {
                await uninstallManagedSkill(skillName, context);
            }
            return;
        }

        await uninstallManagedSkill(input.skill, context);
    },
};
