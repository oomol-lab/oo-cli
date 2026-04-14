import type { CliCommandDefinition } from "../../contracts/cli.ts";
import type { AppSettings } from "../../schemas/settings.ts";

import type { ConfigKey } from "./shared.ts";
import { z } from "zod";
import { writeLine } from "../shared/output.ts";
import {
    configDefinitions,
    configKeyChoices,
    configKeySchema,
    createInvalidConfigKeyError,
    isConfigKey,
} from "./shared.ts";

interface ResolvedConfigSetInput {
    definition: {
        setValue: (settings: AppSettings, value: string) => AppSettings;
    };
    key: ConfigKey;
    value: string;
}

const configSetInputSchema = z.object({
    key: configKeySchema,
    value: z.string(),
}).transform((input, ctx) => {
    const definition = configDefinitions[input.key];
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
        value: valueResult.data,
    } as ResolvedConfigSetInput;
});

export const configSetCommand: CliCommandDefinition<ResolvedConfigSetInput> = {
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
        const definition = isConfigKey(rawInput.key) ? configDefinitions[rawInput.key] : undefined;

        if (!definition) {
            return createInvalidConfigKeyError(rawInput);
        }

        return definition.createInvalidValueError(rawInput.value);
    },
    handler: async (input, context) => {
        await context.settingsStore.update(
            settings => input.definition.setValue(settings, input.value),
        );

        context.logger.info(
            {
                key: input.key,
                value: input.value,
            },
            "Config value persisted.",
        );
        writeLine(
            context.stdout,
            context.translator.t("config.set.success", {
                key: input.key,
                value: input.value,
            }),
        );
    },
};
