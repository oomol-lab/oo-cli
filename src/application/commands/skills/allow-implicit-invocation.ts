import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import {
    booleanConfigValueChoices,
    booleanConfigValueSchema,
    parseBooleanConfigValue,
    setOoSkillAllowImplicitInvocation,
} from "../../schemas/settings.ts";
import { maybeSynchronizeInstalledBundledSkills } from "./shared.ts";

const bundledSkillName = "oo" as const;

const skillsAllowImplicitInvocationInputSchema = z.object({
    value: booleanConfigValueSchema,
});

type SkillsAllowImplicitInvocationInput = z.output<
    typeof skillsAllowImplicitInvocationInputSchema
>;

export const skillsAllowImplicitInvocationCommand: CliCommandDefinition<
    SkillsAllowImplicitInvocationInput
> = {
    name: "allow-implicit-invocation",
    summaryKey: "commands.skills.allowImplicitInvocation.summary",
    descriptionKey: "commands.skills.allowImplicitInvocation.description",
    arguments: [
        {
            name: "value",
            descriptionKey: "arguments.value",
            required: true,
            choices: booleanConfigValueChoices,
        },
    ],
    inputSchema: skillsAllowImplicitInvocationInputSchema,
    handler: async (input, context) => {
        const nextSettings = await context.settingsStore.update(settings =>
            setOoSkillAllowImplicitInvocation(
                settings,
                parseBooleanConfigValue(input.value),
            ),
        );

        await maybeSynchronizeInstalledBundledSkills(context, {
            settings: nextSettings,
        });

        context.logger.info(
            {
                skillName: bundledSkillName,
                value: input.value,
            },
            "Bundled Codex skill implicit invocation policy updated.",
        );
        context.stdout.write(
            `${context.translator.t("skills.allowImplicitInvocation.success", {
                name: bundledSkillName,
                value: input.value,
            })}\n`,
        );
    },
};
