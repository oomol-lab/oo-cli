import type { CliCommandDefinition } from "../../contracts/cli.ts";

import type { ConfigGetInput } from "./shared.ts";
import { z } from "zod";
import {
    configKeyChoices,
    configKeySchema,
    createInvalidConfigKeyError,
    getConfigValue,
} from "./shared.ts";

export const configGetCommand: CliCommandDefinition<ConfigGetInput> = {
    name: "get",
    summaryKey: "commands.config.get.summary",
    descriptionKey: "commands.config.get.description",
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
        const settings = await context.settingsStore.read();
        const value = getConfigValue(settings, input.key);

        if (value) {
            context.stdout.write(`${value}\n`);
        }
    },
};
