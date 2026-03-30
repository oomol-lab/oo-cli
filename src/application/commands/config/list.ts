import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import {
    configKeyChoices,
    getConfigValue,
} from "./shared.ts";

export const configListCommand: CliCommandDefinition = {
    name: "list",
    summaryKey: "commands.config.list.summary",
    descriptionKey: "commands.config.list.description",
    inputSchema: z.object({}),
    handler: async (_, context) => {
        const settings = await context.settingsStore.read();
        const lines = configKeyChoices
            .flatMap((key) => {
                const value = getConfigValue(settings, key);

                return value !== undefined ? [`${key}=${value}`] : [];
            });

        context.logger.debug(
            {
                configuredKeys: lines.map(line => line.split("=")[0] ?? ""),
            },
            "Config values listed.",
        );

        if (lines.length === 0) {
            return;
        }

        context.stdout.write(`${lines.join("\n")}\n`);
    },
};
