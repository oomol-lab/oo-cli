import type { CliCommandDefinition } from "../../contracts/cli.ts";

import type { ConfigUnsetInput } from "./shared.ts";
import { z } from "zod";
import { maybeSynchronizeInstalledBundledSkills } from "../skills/shared.ts";
import {
    configDefinitions,
    configKeyChoices,
    configKeySchema,
    createInvalidConfigKeyError,
    ooSkillImplicitInvocationConfigKey,
    writeLine,
} from "./shared.ts";

export const configUnsetCommand: CliCommandDefinition<ConfigUnsetInput> = {
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
        const nextSettings = await context.settingsStore.update(settings =>
            configDefinitions[input.key].unsetValue(settings),
        );

        if (input.key === ooSkillImplicitInvocationConfigKey) {
            await maybeSynchronizeInstalledBundledSkills(context, {
                settings: nextSettings,
            });
        }

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
