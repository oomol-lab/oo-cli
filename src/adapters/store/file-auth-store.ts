import type { AuthStore } from "../../application/contracts/auth-store.ts";
import type { AuthFile } from "../../application/schemas/auth.ts";
import type { FileStoreLocationOptions } from "./store-path.ts";

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { parse as parseToml } from "smol-toml";
import { CliUserError } from "../../application/contracts/cli.ts";
import {
    authTomlFileSchema,
    defaultAuthFile,
    renderAuthFile,
} from "../../application/schemas/auth.ts";
import { resolveStoreDirectory } from "./store-path.ts";

interface FileAuthStoreLocationOptions extends FileStoreLocationOptions {
    fileName?: string;
}

interface FileAuthStorePathOptions {
    filePath: string;
}

export type FileAuthStoreOptions
    = FileAuthStoreLocationOptions
        | FileAuthStorePathOptions;

export class FileAuthStore implements AuthStore {
    private readonly filePath: string;

    constructor(options: FileAuthStoreOptions) {
        this.filePath = resolveAuthFilePath(options);
    }

    getFilePath(): string {
        return this.filePath;
    }

    async read(): Promise<AuthFile> {
        try {
            return await this.readPersistedAuth();
        }
        catch (error) {
            if (error instanceof CliUserError) {
                throw error;
            }

            if (isFileMissingError(error)) {
                await this.initializeMissingFile();
                return await this.readPersistedAuth();
            }

            throw new CliUserError("errors.authStore.readFailed", 1, {
                path: this.filePath,
            });
        }
    }

    async write(auth: AuthFile): Promise<AuthFile> {
        const renderedAuth = renderAuthFile(auth);
        const directory = dirname(this.filePath);
        const temporaryFilePath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;

        try {
            await mkdir(directory, { recursive: true });
            await writeFile(
                temporaryFilePath,
                renderedAuth,
                "utf8",
            );
            await rename(temporaryFilePath, this.filePath);

            return authTomlFileSchema.parse(parseToml(renderedAuth));
        }
        catch {
            await rm(temporaryFilePath, { force: true }).catch(() => undefined);

            throw new CliUserError("errors.authStore.writeFailed", 1, {
                path: this.filePath,
            });
        }
    }

    async update(
        updater: (auth: AuthFile) => AuthFile,
    ): Promise<AuthFile> {
        const currentAuth = await this.read();
        const nextAuth = updater(currentAuth);

        return this.write(nextAuth);
    }

    private async initializeMissingFile(): Promise<void> {
        const directory = dirname(this.filePath);

        try {
            await mkdir(directory, { recursive: true });
            await writeFile(
                this.filePath,
                renderAuthFile(defaultAuthFile),
                {
                    encoding: "utf8",
                    flag: "wx",
                },
            );
        }
        catch (error) {
            if (isFileAlreadyExistsError(error)) {
                return;
            }

            throw new CliUserError("errors.authStore.writeFailed", 1, {
                path: this.filePath,
            });
        }
    }

    private async readPersistedAuth(): Promise<AuthFile> {
        const content = await readFile(this.filePath, "utf8");

        let parsedContent: unknown;

        try {
            parsedContent = parseToml(content);
        }
        catch {
            throw new CliUserError("errors.authStore.invalidToml", 1, {
                path: this.filePath,
            });
        }

        const parsedAuth = authTomlFileSchema.safeParse(parsedContent);

        if (!parsedAuth.success) {
            throw new CliUserError("errors.authStore.invalidSchema", 1, {
                path: this.filePath,
            });
        }

        return parsedAuth.data;
    }
}

function resolveAuthFilePath(options: FileAuthStoreOptions): string {
    if ("filePath" in options) {
        return options.filePath;
    }

    return join(
        resolveStoreDirectory(options),
        options.fileName ?? "auth.toml",
    );
}

function isFileMissingError(error: unknown): error is NodeJS.ErrnoException {
    return Boolean(
        error
        && typeof error === "object"
        && "code" in error
        && error.code === "ENOENT",
    );
}

function isFileAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
    return Boolean(
        error
        && typeof error === "object"
        && "code" in error
        && error.code === "EEXIST",
    );
}
