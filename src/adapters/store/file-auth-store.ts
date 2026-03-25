import type { Logger } from "pino";
import type { AuthStore } from "../../application/contracts/auth-store.ts";
import type { AuthFile } from "../../application/schemas/auth.ts";
import type { FileStoreLocationOptions } from "./store-path.ts";

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { parse as parseToml } from "smol-toml";
import { CliUserError } from "../../application/contracts/cli.ts";
import { logCategory } from "../../application/logging/log-categories.ts";
import {
    withCategory,
    withStorePath,
} from "../../application/logging/log-fields.ts";
import {
    authTomlFileSchema,
    defaultAuthFile,
    renderAuthFile,
} from "../../application/schemas/auth.ts";
import { resolveStoreDirectory } from "./store-path.ts";

interface FileAuthStoreSharedOptions {
    logger?: Logger;
}

interface FileAuthStoreLocationOptions
    extends FileStoreLocationOptions, FileAuthStoreSharedOptions {
    fileName?: string;
}

interface FileAuthStorePathOptions extends FileAuthStoreSharedOptions {
    filePath: string;
}

export type FileAuthStoreOptions
    = FileAuthStoreLocationOptions
        | FileAuthStorePathOptions;

export class FileAuthStore implements AuthStore {
    private readonly filePath: string;
    private readonly logger?: Logger;

    constructor(options: FileAuthStoreOptions) {
        this.filePath = resolveAuthFilePath(options);
        this.logger = options.logger;
    }

    getFilePath(): string {
        return this.filePath;
    }

    async read(): Promise<AuthFile> {
        try {
            const auth = await this.readPersistedAuth();

            this.logger?.debug(
                {
                    accountCount: auth.auth.length,
                    currentAuthId: auth.id,
                    ...withStorePath(this.filePath),
                },
                "Auth store read completed.",
            );

            return auth;
        }
        catch (error) {
            if (error instanceof CliUserError) {
                throw error;
            }

            if (isFileMissingError(error)) {
                this.logger?.info(
                    {
                        ...withStorePath(this.filePath),
                    },
                    "Auth store file was missing. Initializing a default file.",
                );
                await this.initializeMissingFile();
                const auth = await this.readPersistedAuth();

                this.logger?.debug(
                    {
                        accountCount: auth.auth.length,
                        currentAuthId: auth.id,
                        ...withStorePath(this.filePath),
                    },
                    "Auth store read completed after initialization.",
                );

                return auth;
            }

            this.logger?.error(
                {
                    ...withCategory(logCategory.systemError),
                    err: error,
                    ...withStorePath(this.filePath),
                },
                "Auth store read failed unexpectedly.",
            );
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

            const parsedAuth = authTomlFileSchema.parse(parseToml(renderedAuth));

            this.logger?.info(
                {
                    accountCount: parsedAuth.auth.length,
                    currentAuthId: parsedAuth.id,
                    ...withStorePath(this.filePath),
                },
                "Auth store write completed.",
            );

            return parsedAuth;
        }
        catch (error) {
            await rm(temporaryFilePath, { force: true }).catch(() => undefined);

            this.logger?.error(
                {
                    ...withCategory(logCategory.systemError),
                    err: error,
                    ...withStorePath(this.filePath),
                },
                "Auth store write failed unexpectedly.",
            );
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

        this.logger?.debug(
            {
                nextAccountCount: nextAuth.auth.length,
                nextCurrentAuthId: nextAuth.id,
                ...withStorePath(this.filePath),
                previousAccountCount: currentAuth.auth.length,
                previousCurrentAuthId: currentAuth.id,
            },
            "Auth store update computed the next state.",
        );

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

            this.logger?.info(
                {
                    ...withStorePath(this.filePath),
                },
                "Auth store default file created.",
            );
        }
        catch (error) {
            if (isFileAlreadyExistsError(error)) {
                this.logger?.debug(
                    {
                        ...withStorePath(this.filePath),
                    },
                    "Auth store default file creation was skipped because the file already exists.",
                );
                return;
            }

            this.logger?.error(
                {
                    ...withCategory(logCategory.systemError),
                    err: error,
                    ...withStorePath(this.filePath),
                },
                "Auth store default file creation failed unexpectedly.",
            );
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
        catch (error) {
            this.logger?.error(
                {
                    ...withCategory(logCategory.systemError),
                    contentBytes: content.length,
                    err: error,
                    ...withStorePath(this.filePath),
                },
                "Auth store file contained invalid TOML.",
            );
            throw new CliUserError("errors.authStore.invalidToml", 1, {
                path: this.filePath,
            });
        }

        const parsedAuth = authTomlFileSchema.safeParse(parsedContent);

        if (!parsedAuth.success) {
            this.logger?.error(
                {
                    ...withCategory(logCategory.systemError),
                    issueCount: parsedAuth.error.issues.length,
                    issuePaths: parsedAuth.error.issues.map(issue =>
                        issue.path.length === 0 ? "(root)" : issue.path.join("."),
                    ),
                    ...withStorePath(this.filePath),
                },
                "Auth store file contained an unsupported schema.",
            );
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
