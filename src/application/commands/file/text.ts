import type { CliExecutionContext } from "../../contracts/cli.ts";

import type { FileUploadRecordView } from "./shared.ts";

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

function formatFileSize(value: number): string {
    const units = ["B", "KiB", "MiB", "GiB"] as const;
    let unitIndex = 0;
    let size = value;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    const decimalPlaces = unitIndex === 0 ? 0 : 2;

    return `${size.toFixed(decimalPlaces)} ${units[unitIndex]}`;
}
