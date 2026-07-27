import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import {
    parseFileLimit,
    parseFileStatus,
    serializeFileUploadRecord,
} from "./shared.ts";
import { formatFileUploadListAsText } from "./text.ts";

interface FileListInput {
    limit?: string;
    status?: string;
}

export const fileListCommand: CliCommandDefinition<FileListInput> = {
    name: "list",
    summaryKey: "commands.file.list.summary",
    descriptionKey: "commands.file.list.description",
    options: [
        {
            name: "status",
            longFlag: "--status",
            valueName: "status",
            descriptionKey: "options.fileStatus",
        },
        {
            name: "limit",
            longFlag: "--limit",
            valueName: "limit",
            descriptionKey: "options.limit",
        },
    ],
    output: "standard",
    inputSchema: z.object({
        limit: z.string().optional(),
        status: z.string().optional(),
    }),
    handler: (input, context) => {
        const limit = parseFileLimit(input.limit);
        const status = parseFileStatus(input.status);
        const now = Date.now();
        const records = context.fileUploadStore
            .list({
                limit,
                now,
                status,
            })
            .map(record => serializeFileUploadRecord(record, now, context.logger));

        context.output.emit(records, () => {
            if (records.length === 0) {
                const message = status === undefined
                    ? context.translator.t("file.list.noResults")
                    : context.translator.t("file.list.noResultsForStatus", {
                            status: context.translator.t(`file.status.${status}`),
                        });

                context.stdout.write(`${message}\n`);
                return;
            }

            context.stdout.write(
                `${formatFileUploadListAsText(records, context)}\n`,
            );
        });
    },
};
