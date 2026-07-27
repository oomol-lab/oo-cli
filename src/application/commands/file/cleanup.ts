import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";

const staleDownloadSessionTtlMs = 14 * 24 * 60 * 60 * 1000;

export const fileCleanupCommand: CliCommandDefinition = {
    name: "cleanup",
    summaryKey: "commands.file.cleanup.summary",
    descriptionKey: "commands.file.cleanup.description",
    output: "standard",
    inputSchema: z.object({}),
    handler: async (_input, context) => {
        const now = Date.now();
        const deletedUploadCount = context.fileUploadStore.deleteExpired(now);
        const deletedDownloadSessionCount
            = await context.fileDownloadSessionStore.deleteDownloadSessionsUpdatedBefore(
                now - staleDownloadSessionTtlMs,
            );
        const deletedCount = deletedUploadCount + deletedDownloadSessionCount;

        context.output.emit({
            deletedCount,
        }, () => {
            context.stdout.write(
                `${context.translator.t("file.cleanup.success", {
                    deletedCount,
                })}\n`,
            );
        });
    },
};
