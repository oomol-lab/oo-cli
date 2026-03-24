import type { CliCommandDefinition } from "../../contracts/cli.ts";

import type { ConfigSetInput } from "./shared.ts";
import { z } from "zod";
import {
    configKeyChoices,
    configKeySchema,
    createConfigSetInput,
    createInvalidConfigKeyError,
    getConfigDefinition,
    getConfigDefinitionByRawKey,
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

    return createConfigSetInput(input.key, valueResult.data);
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
        await context.settingsStore.update(settings =>
            getConfigDefinition(input.key).setValue(settings, input.value),
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
