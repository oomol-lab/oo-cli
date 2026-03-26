import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { parseFileFormat } from "./shared.ts";

interface FileCleanupInput {
    format?: string;
}

export const fileCleanupCommand: CliCommandDefinition<FileCleanupInput> = {
    name: "cleanup",
    summaryKey: "commands.file.cleanup.summary",
    descriptionKey: "commands.file.cleanup.description",
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        format: z.string().optional(),
    }),
    mapInputError: (_, rawInput) => createFileCleanupInputError(rawInput),
    handler: (input, context) => {
        const format = parseFileFormat(input.format);
        const deletedCount = context.fileUploadStore.deleteExpired(Date.now());

        if (format === "json") {
            writeJsonOutput(context.stdout, {
                deletedCount,
            });
            return;
        }

        context.stdout.write(
            `${context.translator.t("file.cleanup.success", {
                deletedCount,
            })}\n`,
        );
    },
};

function createFileCleanupInputError(
    rawInput: Record<string, unknown>,
): CliUserError {
    return new CliUserError("errors.file.invalidFormat", 2, {
        value: String(rawInput.format ?? ""),
    });
}
