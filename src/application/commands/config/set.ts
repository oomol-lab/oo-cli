import type { CliCommandDefinition } from "../../contracts/cli.ts";
import type { ConfigKey } from "./shared.ts";
import { z } from "zod";
import { disableTelemetryForCurrentInvocation } from "../../telemetry/control.ts";
import { writeLine } from "../shared/output.ts";
import {
    configDefinitions,
    configKeyChoices,
    configKeySchema,
    createInvalidConfigKeyError,
    isConfigKey,
    telemetryEnabledConfigKey,
} from "./shared.ts";

interface ResolvedConfigSetInput {
    key: ConfigKey;
    value: string;
}

const configSetInputSchema = z.object({
    key: configKeySchema,
    value: z.string(),
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
        return createInvalidConfigKeyError(rawInput);
    },
    handler: async (input, context) => {
        context.telemetry?.recordProperties({ config_key: input.key });

        const definition = isConfigKey(input.key)
            ? configDefinitions[input.key]
            : undefined;

        if (!definition) {
            throw createInvalidConfigKeyError({ key: input.key });
        }

        const parsedValue = definition.parseRawValue(input.value);

        if (!parsedValue) {
            throw definition.createInvalidValueError(input.value);
        }

        await context.settingsStore.update(
            settings => parsedValue.apply(settings),
        );

        if (
            input.key === telemetryEnabledConfigKey
            && parsedValue.renderedValue === "false"
        ) {
            disableTelemetryForCurrentInvocation(context);
        }

        context.logger.info(
            {
                key: input.key,
                value: parsedValue.renderedValue,
            },
            "Config value persisted.",
        );
        writeLine(
            context.stdout,
            context.translator.t("config.set.success", {
                key: input.key,
                value: parsedValue.renderedValue,
            }),
        );
    },
};
