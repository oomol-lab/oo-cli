import type { Stats } from "node:fs";
import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import {
    createFormatInputError,
    initFileUpload,
    maxFileUploadSizeBytes,
    parseFileFormat,
    resolveUploadedFileUrl,
    serializeFileUploadRecord,
    uploadFileParts,
} from "./shared.ts";
import { formatFileUploadRecordDetailsAsText } from "./text.ts";

interface FileUploadInput {
    format?: string;
    filePath: string;
}

export const fileUploadCommand: CliCommandDefinition<FileUploadInput> = {
    name: "upload",
    summaryKey: "commands.file.upload.summary",
    descriptionKey: "commands.file.upload.description",
    missingArgumentBehavior: "showHelp",
    arguments: [
        {
            name: "filePath",
            descriptionKey: "arguments.filePath",
            required: true,
        },
    ],
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        format: z.string().optional(),
        filePath: z.string(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const format = parseFileFormat(input.format);
        const account = await requireCurrentAccount(context);
        const sourceFile = await readSourceFile(input.filePath, context.cwd);
        const uploadSession = await initFileUpload(
            account,
            sourceFile.fileName,
            sourceFile.fileSize,
            context,
        );

        await uploadFileParts(sourceFile.file, uploadSession, context);

        const uploadResult = await resolveUploadedFileUrl(
            account,
            uploadSession.uploadId,
            context,
        );
        const uploadedAtMs = Date.now();
        const record = {
            downloadUrl: uploadResult.url,
            expiresAtMs: uploadResult.expiresAtMs,
            fileName: sourceFile.fileName,
            fileSize: sourceFile.fileSize,
            id: Bun.randomUUIDv7(),
            uploadedAtMs,
        };

        context.fileUploadStore.save(record);

        const view = serializeFileUploadRecord(record, uploadedAtMs);

        if (format === "json") {
            writeJsonOutput(context.stdout, view);
            return;
        }

        const lines = [
            context.translator.t("file.upload.success", {
                fileName: sourceFile.fileName,
            }),
            ...formatFileUploadRecordDetailsAsText(view, context),
        ];

        context.stdout.write(`${lines.join("\n")}\n`);
    },
};

async function readSourceFile(
    filePath: string,
    cwd: string,
): Promise<{
    file: {
        size: number;
        slice: (start?: number, end?: number) => Blob;
    };
    fileName: string;
    fileSize: number;
}> {
    const resolvedPath = resolve(cwd, filePath);
    let metadata: Stats;

    try {
        metadata = await stat(resolvedPath);
    }
    catch (error) {
        throw new CliUserError("errors.fileUpload.readFailed", 1, {
            message: error instanceof Error ? error.message : String(error),
            path: resolvedPath,
        });
    }

    if (!metadata.isFile()) {
        throw new CliUserError("errors.fileUpload.pathNotFile", 1, {
            path: resolvedPath,
        });
    }

    if (metadata.size > maxFileUploadSizeBytes) {
        throw new CliUserError("errors.fileUpload.tooLarge", 2, {
            max: maxFileUploadSizeBytes,
            path: resolvedPath,
            size: metadata.size,
        });
    }

    return {
        file: Bun.file(resolvedPath),
        fileName: basename(resolvedPath),
        fileSize: metadata.size,
    };
}
