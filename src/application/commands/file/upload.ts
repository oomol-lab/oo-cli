import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { bucketTelemetryBytes } from "../../telemetry/buckets.ts";
import { readUploadSourceFile } from "../shared/upload-source-file.ts";
import {
    resolveAccountTeamIdentity,
    teamIdentityInputShape,
    teamOption,
} from "../team/identity.ts";
import {
    maxFileUploadSizeBytes,
    serializeFileUploadRecord,
    uploadLocalFile,
} from "./shared.ts";
import { formatFileUploadRecordDetailsAsText } from "./text.ts";

interface FileUploadInput {
    filePath: string;
    team?: string;
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
    options: [teamOption("options.fileUploadTeam")],
    output: "standard",
    inputSchema: z.object({
        filePath: z.string(),
        ...teamIdentityInputShape,
    }),
    handler: async (input, context) => {
        const { account } = await requireIdentity(context);
        const identity = await resolveAccountTeamIdentity(input, account, context);
        const sourceFile = await readUploadSourceFile(input.filePath, context.cwd, {
            errorKeys: {
                pathNotFile: "errors.fileUpload.pathNotFile",
                readFailed: "errors.fileUpload.readFailed",
                tooLarge: "errors.fileUpload.tooLarge",
            },
            maxSizeBytes: maxFileUploadSizeBytes,
            recordTelemetryProperties: context.telemetry?.recordProperties,
        });

        context.telemetry?.recordProperties({
            bytes_total_bucket: bucketTelemetryBytes(sourceFile.fileSize),
            rejected_too_large: false,
        });

        const record = await uploadLocalFile(sourceFile, account, identity, context);
        const view = serializeFileUploadRecord(record, record.uploadedAtMs, context.logger);

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
