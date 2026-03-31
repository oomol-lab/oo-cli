import type { CliCommandDefinition } from "../../../contracts/cli.ts";
import type { BundledSkillName } from "../embedded-assets.ts";

import { z } from "zod";
import {
    createInvalidSkillConfigKeyError,
    createInvalidSkillConfigSkillError,
    getSkillConfigDefinitionByRawInput,
    getSkillConfigValue,
    listSkillConfigValues,
    skillConfigSkillSchema,
} from "./shared.ts";

interface SkillsConfigGetInput {
    key?: string;
    skill: BundledSkillName;
}

const skillsConfigGetInputSchema = z.object({
    key: z.string().optional(),
    skill: skillConfigSkillSchema,
}).transform((input, ctx) => {
    if (input.key === undefined) {
        return input;
    }

    if (!getSkillConfigDefinitionByRawInput(input.skill, input.key)) {
        ctx.addIssue({
            code: "custom",
            message: "Invalid skill config key.",
            path: ["key"],
        });

        return z.NEVER;
    }

    return input;
});

export const skillsConfigGetCommand: CliCommandDefinition<SkillsConfigGetInput> = {
    name: "get",
    summaryKey: "commands.skills.config.get.summary",
    descriptionKey: "commands.skills.config.get.description",
    arguments: [
        {
            name: "skill",
            descriptionKey: "arguments.skill",
            required: true,
        },
        {
            name: "key",
            descriptionKey: "arguments.skillConfigKey",
            required: false,
        },
    ],
    inputSchema: skillsConfigGetInputSchema,
    mapInputError: (_, rawInput) => {
        if (!skillConfigSkillSchema.safeParse(rawInput.skill).success) {
            return createInvalidSkillConfigSkillError(rawInput);
        }

        return createInvalidSkillConfigKeyError(rawInput);
    },
    handler: async (input, context) => {
        const settings = await context.settingsStore.read();

        if (input.key) {
            const value = getSkillConfigValue(settings, input.skill, input.key);

            context.logger.debug(
                {
                    key: input.key,
                    skillName: input.skill,
                },
                "Bundled Codex skill config value read.",
            );
            context.stdout.write(`${value}\n`);
            return;
        }

        const lines = listSkillConfigValues(settings, input.skill);

        context.logger.debug(
            {
                keys: lines.map(line => line.split("=")[0] ?? ""),
                skillName: input.skill,
            },
            "Bundled Codex skill config values listed.",
        );
        context.stdout.write(`${lines.join("\n")}\n`);
    },
};
