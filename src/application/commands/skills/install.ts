import type { CliCommandDefinition } from "../../contracts/cli.ts";
import type { BundledSkillName } from "./embedded-assets.ts";

import { z } from "zod";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import { installRegistrySkills } from "./registry-skill-install.ts";
import { installBundledSkill } from "./shared.ts";

interface SkillsInstallInput {
    all?: boolean;
    packageName?: string;
    skill?: string[];
    yes?: boolean;
}

const defaultBundledSkillName = "oo" as const;

export const skillsInstallCommand: CliCommandDefinition<SkillsInstallInput> = {
    name: "install",
    summaryKey: "commands.skills.install.summary",
    descriptionKey: "commands.skills.install.description",
    arguments: [
        {
            name: "packageName",
            descriptionKey: "arguments.packageName",
            required: false,
        },
    ],
    options: [
        {
            name: "skill",
            longFlag: "--skill",
            shortFlag: "-s",
            valueName: "skills...",
            descriptionKey: "options.skill",
        },
        {
            name: "yes",
            longFlag: "--yes",
            shortFlag: "-y",
            descriptionKey: "options.yes",
        },
        {
            name: "all",
            longFlag: "--all",
            descriptionKey: "options.all",
        },
    ],
    inputSchema: z.object({
        all: z.boolean().optional(),
        packageName: z.string().optional(),
        skill: z.array(z.string()).optional(),
        yes: z.boolean().optional(),
    }),
    handler: async (input, context) => {
        if (
            input.packageName === undefined
            || isBundledSkillName(input.packageName)
        ) {
            await installBundledSkill(
                (input.packageName as BundledSkillName | undefined)
                ?? defaultBundledSkillName,
                context,
            );
            return;
        }

        await installRegistrySkills(
            {
                all: input.all === true,
                packageName: input.packageName,
                skillNames: input.skill ?? [],
                yes: input.yes === true,
            },
            context,
        );
    },
};

function isBundledSkillName(value: string): value is BundledSkillName {
    return availableBundledSkillNames.includes(value as BundledSkillName);
}
