export interface FileDownloadSessionKey {
    outDirPath: string;
    requestUrl: string;
    requestedExtension: string;
    requestedName: string;
}

export interface FileDownloadSessionRecord extends FileDownloadSessionKey {
    entityTag: string;
    finalUrl: string;
    id: string;
    lastModified: string;
    resolvedBaseName: string;
    resolvedExtension: string;
    tempFileName: string;
    totalBytes?: number;
    updatedAtMs: number;
}

export interface FileDownloadSessionStore {
    deleteDownloadSession: (id: string) => Promise<boolean>;
    deleteDownloadSessionsUpdatedBefore: (cutoffMs: number) => Promise<number>;
    findDownloadSessions: (
        key: FileDownloadSessionKey,
    ) => Promise<readonly FileDownloadSessionRecord[]>;
    saveDownloadSession: (record: FileDownloadSessionRecord) => Promise<void>;
    close: () => void;
}
