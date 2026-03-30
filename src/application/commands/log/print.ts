import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { readHistoricalLog } from "../../../adapters/logging/log-reader.ts";
import { CliUserError } from "../../contracts/cli.ts";
import {
    resolveCliLogDirectoryPath,
    writeLine,
} from "./shared.ts";

interface LogPrintInput {
    index?: string;
}

export const logPrintCommand: CliCommandDefinition<LogPrintInput> = {
    name: "print",
    summaryKey: "commands.log.print.summary",
    descriptionKey: "commands.log.print.description",
    arguments: [
        {
            name: "index",
            descriptionKey: "arguments.index",
            required: false,
        },
    ],
    inputSchema: z.object({
        index: z.string().optional(),
    }),
    handler: async (input, context) => {
        const index = parseLogIndex(input.index);
        const content = await readHistoricalLog({
            directoryPath: resolveCliLogDirectoryPath(context),
            excludeFilePath: context.currentLogFilePath,
            index,
        });

        if (!content) {
            writeLine(context.stdout, context.translator.t("log.print.missing", { index }));
            return;
        }

        context.stdout.write(
            content.endsWith("\n") ? content : `${content}\n`,
        );
    },
};

function parseLogIndex(value: string | undefined): number {
    if (value === undefined) {
        return 1;
    }

    const trimmedValue = value.trim();
    const parsedValue = Number(trimmedValue);

    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
        throw new CliUserError("errors.log.invalidIndex", 2, {
            value,
        });
    }

    return parsedValue;
}
