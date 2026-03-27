import type { CliCommandDefinition } from "../../contracts/cli.ts";
import type { AppSettings } from "../../schemas/settings.ts";

import type { ConfigSetInput } from "./shared.ts";
import { z } from "zod";
import { maybeSynchronizeInstalledBundledSkills } from "../skills/shared.ts";
import {
    configKeyChoices,
    configKeySchema,
    createInvalidConfigKeyError,
    fileDownloadOutDirConfigKey,
    getConfigDefinition,
    getConfigDefinitionByRawKey,
    ooSkillImplicitInvocationConfigKey,
    writeLine,
} from "./shared.ts";

const configSetInputSchema = z.object({
    key: configKeySchema,
    value: z.string(),
}).transform((input, ctx) => {
    const definition = getConfigDefinition(input.key);
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
        key: input.key,
        value: valueResult.data,
    } as ConfigSetInput;
});

export const configSetCommand: CliCommandDefinition<ConfigSetInput> = {
    name: "set",
    summaryKey: "commands.config.set.summary",
    descriptionKey: "commands.config.set.description",
    arguments: [
        {
            name: "key",
            descriptionKey: "arguments.key",
            required: true,
            choices: configKeyChoices,
        },
        {
            name: "value",
            descriptionKey: "arguments.value",
            required: true,
        },
    ],
    inputSchema: configSetInputSchema,
    mapInputError: (_, rawInput) => {
        const definition = getConfigDefinitionByRawKey(rawInput.key);

        if (!definition) {
            return createInvalidConfigKeyError(rawInput);
        }

        return definition.createInvalidValueError(rawInput.value);
    },
    handler: async (input, context) => {
        const nextSettings = await context.settingsStore.update(
            settings => setConfigValue(settings, input),
        );

        if (input.key === ooSkillImplicitInvocationConfigKey) {
            await maybeSynchronizeInstalledBundledSkills(context, {
                settings: nextSettings,
            });
        }

        context.logger.info(
            {
                key: input.key,
                value: input.value,
            },
            "Config value persisted.",
        );
        writeLine(
            context,
            context.translator.t("config.set.success", {
                key: input.key,
                value: input.value,
            }),
        );
    },
};

function setConfigValue(
    settings: AppSettings,
    input: ConfigSetInput,
): AppSettings {
    switch (input.key) {
        case "lang":
            return getConfigDefinition("lang").setValue(settings, input.value);
        case fileDownloadOutDirConfigKey:
            return getConfigDefinition(fileDownloadOutDirConfigKey).setValue(
                settings,
                input.value,
            );
        case ooSkillImplicitInvocationConfigKey:
            return getConfigDefinition(
                ooSkillImplicitInvocationConfigKey,
            ).setValue(settings, input.value);
    }
}
