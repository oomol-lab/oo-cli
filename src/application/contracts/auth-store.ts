import type { AuthFile } from "../schemas/auth.ts";

/**
 * Condition of the persisted auth file as observed by a tolerant read:
 * "missing" when it does not exist, "corrupt" when it exists but cannot be
 * read or parsed, "ok" otherwise.
 */
export type AuthFileState = "corrupt" | "missing" | "ok";

export interface TolerantAuthRead {
    authFile: AuthFile;
    fileState: AuthFileState;
}

export interface AuthStore {
    getFilePath: () => string;
    read: () => Promise<AuthFile>;
    /**
     * Reads the persisted auth for display only: never creates a missing file,
     * and never throws on a missing or unreadable one (it yields the empty
     * auth file plus a `fileState` saying why). Callers that hold a credential
     * from somewhere else — an OO_API_KEY override — must use this instead of
     * `read()`, which initializes the file on disk and fails the command on a
     * corrupt one.
     */
    readTolerantState: () => Promise<TolerantAuthRead>;
    write: (auth: AuthFile) => Promise<AuthFile>;
    update: (
        updater: (auth: AuthFile) => AuthFile,
    ) => Promise<AuthFile>;
}
