import type { CliExecutionContext } from "../../contracts/cli.ts";

import type { FileUploadRecordView } from "./shared.ts";
import { formatFileSize } from "../shared/file-size.ts";

type FileTextContext = Pick<CliExecutionContext, "translator">;

function formatFileUploadRecordAsText(
    record: FileUploadRecordView,
    context: FileTextContext,
): string {
    return [
        record.fileName,
        ...formatFileUploadRecordDetailsAsText(record, context),
    ].join("\n");
}

export function formatFileUploadRecordDetailsAsText(
    record: FileUploadRecordView,
    context: FileTextContext,
): string[] {
    return [
        `  - ${context.translator.t("file.text.id")}: ${record.id}`,
        `  - ${context.translator.t("file.text.fileSize")}: ${formatFileSize(record.fileSize)}`,
        `  - ${context.translator.t("file.text.uploadedAt")}: ${record.uploadedAt}`,
        `  - ${context.translator.t("file.text.expiresAt")}: ${record.expiresAt}`,
        `  - ${context.translator.t("labels.status")}: ${context.translator.t(`file.status.${record.status}`)}`,
        `  - ${context.translator.t("file.text.downloadUrl")}: ${record.downloadUrl}`,
    ];
}

export function formatFileUploadListAsText(
    records: readonly FileUploadRecordView[],
    context: FileTextContext,
): string {
    return records
        .map(record => formatFileUploadRecordAsText(record, context))
        .join("\n\n");
}
