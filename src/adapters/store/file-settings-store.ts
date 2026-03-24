import type { SettingsStore } from "../../application/contracts/settings-store.ts";
import type { AppSettings } from "../../application/schemas/settings.ts";
import type { FileStoreLocationOptions } from "./store-path.ts";

import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { parse as parseToml } from "smol-toml";
import { CliUserError } from "../../application/contracts/cli.ts";
import {
    defaultSettings,
    renderSettingsFile,
    settingsFileSchema,
} from "../../application/schemas/settings.ts";
import { resolveStoreDirectory } from "./store-path.ts";

interface FileSettingsStoreLocationOptions extends FileStoreLocationOptions {
    fileName?: string;
}

interface FileSettingsStorePathOptions {
    filePath: string;
}

export type FileSettingsStoreOptions
    = FileSettingsStoreLocationOptions
        | FileSettingsStorePathOptions;

export class FileSettingsStore implements SettingsStore {
    private readonly filePath: string;

    constructor(options: FileSettingsStoreOptions) {
        this.filePath = resolveSettingsFilePath(options);
    }

    getFilePath(): string {
        return this.filePath;
    }

    async read(): Promise<AppSettings> {
        try {
            return await this.readPersistedSettings();
        }
        catch (error) {
            if (error instanceof CliUserError) {
                throw error;
            }

            if (isFileMissingError(error)) {
                await this.initializeMissingFile();
                return await this.readPersistedSettings();
            }

            throw new CliUserError("errors.store.readFailed", 1, {
                path: this.filePath,
            });
        }
    }

    async write(settings: AppSettings): Promise<AppSettings> {
        const parsedSettings = settingsFileSchema.parse(settings);
        const directory = dirname(this.filePath);
        const temporaryFilePath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;

        try {
            await mkdir(directory, { recursive: true });
            await writeFile(
                temporaryFilePath,
                renderSettingsFile(parsedSettings),
                "utf8",
            );
            await rename(temporaryFilePath, this.filePath);

            return parsedSettings;
        }
        catch {
            await rm(temporaryFilePath, { force: true }).catch(() => undefined);

            throw new CliUserError("errors.store.writeFailed", 1, {
                path: this.filePath,
            });
        }
    }

    async update(
        updater: (settings: AppSettings) => AppSettings,
    ): Promise<AppSettings> {
        const currentSettings = await this.read();
        const nextSettings = updater(currentSettings);

        return this.write(nextSettings);
    }

    private async initializeMissingFile(): Promise<void> {
        const directory = dirname(this.filePath);

        try {
            await mkdir(directory, { recursive: true });
            await writeFile(
                this.filePath,
                renderSettingsFile(defaultSettings),
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

            throw new CliUserError("errors.store.writeFailed", 1, {
                path: this.filePath,
            });
        }
    }

    private async readPersistedSettings(): Promise<AppSettings> {
        const content = await readFile(this.filePath, "utf8");

        let parsedContent: unknown;

        try {
            parsedContent = parseToml(content);
        }
        catch {
            throw new CliUserError("errors.store.invalidToml", 1, {
                path: this.filePath,
            });
        }

        const parsedSettings = settingsFileSchema.safeParse(parsedContent);

        if (!parsedSettings.success) {
            throw new CliUserError("errors.store.invalidSchema", 1, {
                path: this.filePath,
            });
        }

        return parsedSettings.data;
    }
}

function resolveSettingsFilePath(options: FileSettingsStoreOptions): string {
    if ("filePath" in options) {
        return options.filePath;
    }

    return join(
        resolveStoreDirectory(options),
        options.fileName ?? "settings.toml",
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
