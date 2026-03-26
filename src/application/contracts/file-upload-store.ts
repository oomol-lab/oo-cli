export const fileUploadStatusValues = ["active", "expired"] as const;

export type FileUploadStatus = (typeof fileUploadStatusValues)[number];

export interface FileUploadRecord {
    id: string;
    fileName: string;
    fileSize: number;
    downloadUrl: string;
    uploadedAtMs: number;
    expiresAtMs: number;
}

export interface FileUploadListOptions {
    limit?: number;
    now: number;
    status?: FileUploadStatus;
}

export interface FileUploadRecordStore {
    getFilePath: () => string;
    save: (record: FileUploadRecord) => void;
    list: (options: FileUploadListOptions) => FileUploadRecord[];
    deleteExpired: (now: number) => number;
    close: () => void;
}
