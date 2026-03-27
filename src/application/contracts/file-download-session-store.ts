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
    getFilePath: () => string;
    deleteDownloadSession: (id: string) => boolean;
    deleteDownloadSessionsUpdatedBefore: (cutoffMs: number) => number;
    findDownloadSession: (
        key: FileDownloadSessionKey,
    ) => FileDownloadSessionRecord | undefined;
    saveDownloadSession: (record: FileDownloadSessionRecord) => void;
    close: () => void;
}
