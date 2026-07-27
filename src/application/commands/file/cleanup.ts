import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { outputFormatOptions, writeJsonOutput } from "../command-output.ts";
import { createFormatInputError, parseFileFormat } from "./shared.ts";

interface FileCleanupInput {
    format?: string;
    showSchemaVersion?: boolean;
}

const staleDownloadSessionTtlMs = 14 * 24 * 60 * 60 * 1000;

export const fileCleanupCommand: CliCommandDefinition<FileCleanupInput> = {
    name: "cleanup",
    summaryKey: "commands.file.cleanup.summary",
    descriptionKey: "commands.file.cleanup.description",
    options: [...outputFormatOptions],
    inputSchema: z.object({
        format: z.string().optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const format = parseFileFormat(input.format);
        const now = Date.now();
        const deletedUploadCount = context.fileUploadStore.deleteExpired(now);
        const deletedDownloadSessionCount
            = await context.fileDownloadSessionStore.deleteDownloadSessionsUpdatedBefore(
                now - staleDownloadSessionTtlMs,
            );
        const deletedCount = deletedUploadCount + deletedDownloadSessionCount;

        if (format === "json") {
            writeJsonOutput(context.stdout, {
                deletedCount,
            }, {
                showSchemaVersion: input.showSchemaVersion,
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
