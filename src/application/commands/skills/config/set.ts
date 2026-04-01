import type { CliCommandDefinition } from "../../../contracts/cli.ts";
import type { AppSettings } from "../../../schemas/settings.ts";
import type { ConfigurableBundledSkillName } from "./shared.ts";
import { z } from "zod";
import { maybeSynchronizeInstalledBundledSkills } from "../shared.ts";
import {
    createInvalidSkillConfigKeyError,
    createInvalidSkillConfigSkillError,
    getSkillConfigDefinitionByRawInput,
    skillConfigSkillSchema,
} from "./shared.ts";

interface ResolvedSkillsConfigSetInput {
    definition: {
        setValue: (settings: AppSettings, value: string) => AppSettings;
    };
    key: string;
    skill: ConfigurableBundledSkillName;
    value: string;
}

const skillsConfigSetInputSchema = z.object({
    skill: skillConfigSkillSchema,
    key: z.string(),
    value: z.string(),
}).transform((input, ctx) => {
    const definition = getSkillConfigDefinitionByRawInput(input.skill, input.key);

    if (!definition) {
        ctx.addIssue({
            code: "custom",
            message: "Invalid skill config key.",
            path: ["key"],
        });

        return z.NEVER;
    }

    const valueResult = definition.valueSchema.safeParse(input.value);

    if (!valueResult.success) {
        ctx.addIssue({
            code: "custom",
            message: valueResult.error.message,
            path: ["value"],
        });

        return z.NEVER;
    }

    return {
        definition,
        key: input.key,
        skill: input.skill,
        value: input.value,
    } as ResolvedSkillsConfigSetInput;
});

export const skillsConfigSetCommand: CliCommandDefinition<ResolvedSkillsConfigSetInput> = {
    name: "set",
    summaryKey: "commands.skills.config.set.summary",
    descriptionKey: "commands.skills.config.set.description",
    arguments: [
        {
            name: "skill",
            descriptionKey: "arguments.skill",
            required: true,
        },
        {
            name: "key",
            descriptionKey: "arguments.skillConfigKey",
            required: true,
        },
        {
            name: "value",
            descriptionKey: "arguments.value",
            required: true,
        },
    ],
    inputSchema: skillsConfigSetInputSchema,
    mapInputError: (_, rawInput) => {
        if (!skillConfigSkillSchema.safeParse(rawInput.skill).success) {
            return createInvalidSkillConfigSkillError(rawInput);
        }

        const definition = getSkillConfigDefinitionByRawInput(
            rawInput.skill,
            rawInput.key,
        );

        if (!definition) {
            return createInvalidSkillConfigKeyError(rawInput);
        }

        return definition.createInvalidValueError(
            rawInput.skill as ResolvedSkillsConfigSetInput["skill"],
            rawInput.value,
        );
    },
    handler: async (input, context) => {
        const nextSettings = await context.settingsStore.update(settings =>
            input.definition.setValue(settings, input.value),
        );

        await maybeSynchronizeInstalledBundledSkills(context, {
            settings: nextSettings,
        });

        context.logger.info(
            {
                key: input.key,
                skillName: input.skill,
                value: input.value,
            },
            "Bundled Codex skill config updated.",
        );
        context.stdout.write(
            `${context.translator.t("skills.config.set.success", {
                key: input.key,
                name: input.skill,
                value: input.value,
            })}\n`,
        );
    },
};
