import type {
    FileDownloadSessionRecord,
    FileDownloadSessionStore,
} from "../../../../contracts/file-download-session-store.ts";

import { CliUserError } from "../../../../contracts/cli.ts";

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

                return true;
            },
            deleteDownloadSessionsUpdatedBefore(cutoffMs) {
                deletedSessionCutoffs.push(cutoffMs);
                return 0;
            },
            findDownloadSession() {
                return currentSession;
            },
            getFilePath() {
                return "";
            },
            saveDownloadSession(record) {
                savedSessions.push(record);
                currentSession = record;
            },
        },
        setCurrentSession(session) {
            currentSession = session;
        },
    };
}

export async function expectCliUserError(
    operation: Promise<unknown>,
): Promise<CliUserError> {
    try {
        await operation;
    }
    catch (error) {
        if (error instanceof CliUserError) {
            return error;
        }

        throw error;
    }

    throw new Error("Expected a CliUserError to be thrown.");
}

export function setResponseUrl(response: Response, url: string): Response {
    Object.defineProperty(response, "url", {
        value: url,
    });

    return response;
}
