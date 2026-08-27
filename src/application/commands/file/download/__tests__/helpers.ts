import type {
    FileDownloadSessionRecord,
    FileDownloadSessionStore,
} from "../../../../contracts/file-download-session-store.ts";
import type { DownloadTempLockHandle } from "../../../../shared/download-temp-lock.ts";

export { expectCliUserError } from "../../../../../../__tests__/helpers.ts";

export interface DownloadSessionStoreSpy {
    readonly deletedSessionCutoffs: number[];
    readonly deletedSessionIds: string[];
    readonly savedSessions: FileDownloadSessionRecord[];
    readonly store: FileDownloadSessionStore;
    setCurrentSession: (session: FileDownloadSessionRecord | undefined) => void;
}

export function createDownloadSessionRecordFixture(
    overrides: Partial<FileDownloadSessionRecord> = {},
): FileDownloadSessionRecord {
    return {
        entityTag: "\"etag-1\"",
        finalUrl: "https://example.com/files/report.txt",
        id: "0195f5fe-ec30-7000-8000-000000000011",
        lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
        outDirPath: "/tmp/downloads",
        requestUrl: "https://example.com/files/report.txt",
        requestedExtension: "",
        requestedName: "",
        resolvedBaseName: "report",
        resolvedExtension: "txt",
        tempFileName: "report.oodownload",
        totalBytes: 10,
        updatedAtMs: 1_000,
        ...overrides,
    };
}

export function createDownloadTempLockHandleFixture(
    lockFilePath = "",
): DownloadTempLockHandle {
    return {
        async close() {},
        data: {
            acquiredAt: new Date(0).toISOString(),
            execPath: process.execPath,
            pid: process.pid,
            sessionId: "0195f5fe-ec30-7000-8000-000000000011",
            tempFileName: "report.oodownload",
        },
        lockFilePath,
    };
}

export function createDownloadSessionStoreSpy(
    initialSession?: FileDownloadSessionRecord,
): DownloadSessionStoreSpy {
    let currentSession = initialSession;
    const deletedSessionCutoffs: number[] = [];
    const deletedSessionIds: string[] = [];
    const savedSessions: FileDownloadSessionRecord[] = [];

    return {
        deletedSessionCutoffs,
        deletedSessionIds,
        savedSessions,
        store: {
            close() {},
            deleteDownloadSession(id) {
                deletedSessionIds.push(id);

                if (currentSession?.id === id) {
                    currentSession = undefined;
                }

                return Promise.resolve(true);
            },
            deleteDownloadSessionsUpdatedBefore(cutoffMs) {
                deletedSessionCutoffs.push(cutoffMs);
                return Promise.resolve(0);
            },
            findDownloadSession() {
                return Promise.resolve(currentSession);
            },
            findDownloadSessions() {
                return Promise.resolve(currentSession === undefined ? [] : [currentSession]);
            },
            saveDownloadSession(record) {
                savedSessions.push(record);
                currentSession = record;
                return Promise.resolve();
            },
        },
        setCurrentSession(session) {
            currentSession = session;
        },
    };
}

export function setResponseUrl(response: Response, url: string): Response {
    Object.defineProperty(response, "url", {
        value: url,
    });

    return response;
}
