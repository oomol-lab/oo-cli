import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { writeLine } from "../shared/output.ts";
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
        const configuredKeys: string[] = [];
        const lines: string[] = [];

        for (const key of configKeyChoices) {
            const value = getConfigValue(settings, key);

            if (value !== undefined) {
                configuredKeys.push(key);
                lines.push(`${key}=${value}`);
            }
        }

        context.logger.debug(
            {
                configuredKeys,
            },
            "Config values listed.",
        );

        if (lines.length === 0) {
            return;
        }

        writeLine(context.stdout, lines.join("\n"));
    },
};
