import type { AuthFile } from "../schemas/auth.ts";

export interface AuthStore {
    getFilePath: () => string;
    read: () => Promise<AuthFile>;
    write: (auth: AuthFile) => Promise<AuthFile>;
    update: (
        updater: (auth: AuthFile) => AuthFile,
    ) => Promise<AuthFile>;
}
