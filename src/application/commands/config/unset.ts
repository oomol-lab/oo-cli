import type { CliCommandDefinition } from "../../contracts/cli.ts";

import type { ConfigKeyInput } from "./shared.ts";
import { z } from "zod";
import { writeLine } from "../shared/output.ts";
import {
    configDefinitions,
    configKeyChoices,
    configKeySchema,
    createInvalidConfigKeyError,
} from "./shared.ts";

export const configUnsetCommand: CliCommandDefinition<ConfigKeyInput> = {
    name: "unset",
    summaryKey: "commands.config.unset.summary",
    descriptionKey: "commands.config.unset.description",
    arguments: [
        {
            name: "key",
            descriptionKey: "arguments.key",
            required: true,
            choices: configKeyChoices,
        },
    ],
    inputSchema: z.object({
        key: configKeySchema,
    }),
    mapInputError: (_, rawInput) => createInvalidConfigKeyError(rawInput),
    handler: async (input, context) => {
        await context.settingsStore.update(settings =>
            configDefinitions[input.key].unsetValue(settings),
        );

        context.logger.info(
            {
                key: input.key,
            },
            "Config value removed.",
        );
        writeLine(
            context.stdout,
            context.translator.t("config.unset.success", {
                key: input.key,
            }),
        );
    },
};
