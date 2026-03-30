import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import {
    createFormatInputError,
    parseFileFormat,
    parseFileLimit,
    parseFileStatus,
    serializeFileUploadRecord,
} from "./shared.ts";
import { formatFileUploadListAsText } from "./text.ts";

interface FileListInput {
    format?: string;
    limit?: string;
    status?: string;
}

export const fileListCommand: CliCommandDefinition<FileListInput> = {
    name: "list",
    summaryKey: "commands.file.list.summary",
    descriptionKey: "commands.file.list.description",
    options: [
        ...jsonOutputOptions,
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
    inputSchema: z.object({
        format: z.string().optional(),
        limit: z.string().optional(),
        status: z.string().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: (input, context) => {
        const format = parseFileFormat(input.format);
        const limit = parseFileLimit(input.limit);
        const status = parseFileStatus(input.status);
        const now = Date.now();
        const records = context.fileUploadStore
            .list({
                limit,
                now,
                status,
            })
            .map(record => serializeFileUploadRecord(record, now));

        if (format === "json") {
            writeJsonOutput(context.stdout, records);
            return;
        }

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
    },
};
