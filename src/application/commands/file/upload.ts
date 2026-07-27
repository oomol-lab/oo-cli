import type { Stats } from "node:fs";
import type {
    CliCommandDefinition,
    CliExecutionContext,
} from "../../contracts/cli.ts";

import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { bucketTelemetryBytes } from "../../telemetry/buckets.ts";
import { outputFormatOptions, writeJsonOutput } from "../command-output.ts";
import {
    completeMultipartFileUpload,
    createFormatInputError,
    createMultipartFileUpload,
    fileUploadExpiresInMs,
    generatePresignedFileUploadPartUrls,
    maxFileUploadSizeBytes,
    parseFileFormat,
    serializeFileUploadRecord,
    uploadFileParts,
} from "./shared.ts";
import { formatFileUploadRecordDetailsAsText } from "./text.ts";

interface FileUploadInput {
    format?: string;
    filePath: string;
    showSchemaVersion?: boolean;
}

type RecordTelemetryProperties = NonNullable<
    CliExecutionContext["telemetry"]
>["recordProperties"];

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
    options: [...outputFormatOptions],
    inputSchema: z.object({
        format: z.string().optional(),
        filePath: z.string(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const format = parseFileFormat(input.format);
        const { account } = await requireIdentity(context);
        const sourceFile = await readSourceFile(
            input.filePath,
            context.cwd,
            context.telemetry?.recordProperties,
        );

        context.telemetry?.recordProperties({
            bytes_total_bucket: bucketTelemetryBytes(sourceFile.fileSize),
            rejected_too_large: false,
        });

        const uploadSession = await createMultipartFileUpload(
            account,
            sourceFile.fileName,
            sourceFile.fileSize,
            context,
        );
        const presignedPartUrls = await generatePresignedFileUploadPartUrls(
            account,
            uploadSession,
            context,
        );

        const uploadedParts = await uploadFileParts(
            sourceFile.file,
            uploadSession,
            presignedPartUrls,
            context,
        );

        const uploadResult = await completeMultipartFileUpload(
            account,
            uploadSession,
            uploadedParts,
            context,
        );
        const uploadedAtMs = Date.now();
        const record = {
            downloadUrl: uploadResult.downloadUrl,
            expiresAtMs: uploadedAtMs + fileUploadExpiresInMs,
            fileName: sourceFile.fileName,
            fileSize: sourceFile.fileSize,
            id: Bun.randomUUIDv7(),
            uploadedAtMs,
        };

        context.fileUploadStore.save(record);

        const view = serializeFileUploadRecord(record, uploadedAtMs, context.logger);

        if (format === "json") {
            writeJsonOutput(context.stdout, view, {
                showSchemaVersion: input.showSchemaVersion,
            });
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
    recordTelemetryProperties: RecordTelemetryProperties | undefined,
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
        recordTelemetryProperties?.({
            bytes_total_bucket: bucketTelemetryBytes(metadata.size),
            rejected_too_large: true,
        });
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
