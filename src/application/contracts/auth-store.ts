import type { AuthFile } from "../schemas/auth.ts";

export interface AuthStore {
    getFilePath: () => string;
    read: () => Promise<AuthFile>;
    /**
     * Reads the persisted auth for display only: never creates a missing file,
     * and never throws on a missing or unreadable one (it yields the empty auth
     * file instead). Callers that hold a credential from somewhere else — an
     * OO_API_KEY override — must use this instead of `read()`, which initializes
     * the file on disk and fails the command on a corrupt one.
     */
    readTolerant: () => Promise<AuthFile>;
    write: (auth: AuthFile) => Promise<AuthFile>;
    update: (
        updater: (auth: AuthFile) => AuthFile,
    ) => Promise<AuthFile>;
}
