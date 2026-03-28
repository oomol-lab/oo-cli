import type { CliCommandDefinition } from "../../contracts/cli.ts";
import type { BundledSkillName } from "./embedded-assets.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import { installBundledSkill } from "./shared.ts";

interface SkillsInstallInput {
    skill: BundledSkillName;
}

const defaultBundledSkillName = "oo" as const;
const bundledSkillNameSchema = z.enum(availableBundledSkillNames);

const skillsInstallInputSchema = z.object({
    skill: bundledSkillNameSchema.default(defaultBundledSkillName),
});

export const skillsInstallCommand: CliCommandDefinition<SkillsInstallInput> = {
    name: "install",
    summaryKey: "commands.skills.install.summary",
    descriptionKey: "commands.skills.install.description",
    arguments: [
        {
            name: "skill",
            descriptionKey: "arguments.skill",
            required: false,
        },
    ],
    inputSchema: skillsInstallInputSchema,
    mapInputError: (_, rawInput) =>
        new CliUserError("errors.skills.invalidName", 2, {
            choices: availableBundledSkillNames.join(", "),
            value: String(rawInput.skill ?? ""),
        }),
    handler: async (input, context) => {
        await installBundledSkill(input.skill, context);
    },
};
