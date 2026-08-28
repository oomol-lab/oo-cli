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
import {
    teamIdentityInputShape,
    teamIdentityOptions,
} from "../team/identity.ts";
import {
    completeMultipartFileUpload,
    createMultipartFileUpload,
    fileUploadExpiresInMs,
    generatePresignedFileUploadPartUrls,
    maxFileUploadSizeBytes,
    resolveFileUploadIdentity,
    serializeFileUploadRecord,
    uploadFileParts,
} from "./shared.ts";
import { formatFileUploadRecordDetailsAsText } from "./text.ts";

interface FileUploadInput {
    filePath: string;
    personal?: boolean;
    team?: string;
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
    options: teamIdentityOptions({
        personal: "options.fileUploadPersonal",
        team: "options.fileUploadTeam",
    }),
    output: "standard",
    inputSchema: z.object({
        filePath: z.string(),
        ...teamIdentityInputShape,
    }),
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        const identity = await resolveFileUploadIdentity(input, account, context);
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
            identity,
            sourceFile.fileName,
            sourceFile.fileSize,
            context,
        );
        const presignedPartUrls = await generatePresignedFileUploadPartUrls(
            account,
            identity,
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
            identity,
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

        context.output.emit(view, () => {
            const lines = [
                context.translator.t("file.upload.success", {
                    fileName: sourceFile.fileName,
                }),
                ...formatFileUploadRecordDetailsAsText(view, context),
            ];

            context.stdout.write(`${lines.join("\n")}\n`);
        });
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
