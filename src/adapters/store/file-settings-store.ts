import type { Logger } from "pino";
import type { SettingsStore } from "../../application/contracts/settings-store.ts";
import type { AppSettings } from "../../application/schemas/settings.ts";
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
    defaultSettings,
    renderSettingsFile,
    settingsFileSchema,
} from "../../application/schemas/settings.ts";
import { resolveStoreDirectory } from "./store-path.ts";

interface FileSettingsStoreSharedOptions {
    logger?: Logger;
}

interface FileSettingsStoreLocationOptions
    extends FileStoreLocationOptions, FileSettingsStoreSharedOptions {
    fileName?: string;
}

interface FileSettingsStorePathOptions extends FileSettingsStoreSharedOptions {
    filePath: string;
}

export type FileSettingsStoreOptions
    = FileSettingsStoreLocationOptions
        | FileSettingsStorePathOptions;

export class FileSettingsStore implements SettingsStore {
    private readonly filePath: string;
    private readonly logger?: Logger;

    constructor(options: FileSettingsStoreOptions) {
        this.filePath = resolveSettingsFilePath(options);
        this.logger = options.logger;
    }

    getFilePath(): string {
        return this.filePath;
    }

    async read(): Promise<AppSettings> {
        try {
            const settings = await this.readPersistedSettings();

            this.logger?.debug(
                {
                    configuredKeys: readConfiguredSettingsKeys(settings),
                    ...withStorePath(this.filePath),
                },
                "Settings store read completed.",
            );

            return settings;
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
                    "Settings store file was missing. Initializing a default file.",
                );
                await this.initializeMissingFile();
                const settings = await this.readPersistedSettings();

                this.logger?.debug(
                    {
                        configuredKeys: readConfiguredSettingsKeys(settings),
                        ...withStorePath(this.filePath),
                    },
                    "Settings store read completed after initialization.",
                );

                return settings;
            }

            this.logger?.error(
                {
                    ...withCategory(logCategory.systemError),
                    err: error,
                    ...withStorePath(this.filePath),
                },
                "Settings store read failed unexpectedly.",
            );
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

            this.logger?.info(
                {
                    configuredKeys: readConfiguredSettingsKeys(parsedSettings),
                    ...withStorePath(this.filePath),
                },
                "Settings store write completed.",
            );

            return parsedSettings;
        }
        catch (error) {
            await rm(temporaryFilePath, { force: true }).catch(() => undefined);

            this.logger?.error(
                {
                    ...withCategory(logCategory.systemError),
                    err: error,
                    ...withStorePath(this.filePath),
                },
                "Settings store write failed unexpectedly.",
            );
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

        this.logger?.debug(
            {
                nextConfiguredKeys: readConfiguredSettingsKeys(nextSettings),
                ...withStorePath(this.filePath),
                previousConfiguredKeys: readConfiguredSettingsKeys(currentSettings),
            },
            "Settings store update computed the next state.",
        );

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

            this.logger?.info(
                {
                    ...withStorePath(this.filePath),
                },
                "Settings store default file created.",
            );
        }
        catch (error) {
            if (isFileAlreadyExistsError(error)) {
                this.logger?.debug(
                    {
                        ...withStorePath(this.filePath),
                    },
                    "Settings store default file creation was skipped because the file already exists.",
                );
                return;
            }

            this.logger?.error(
                {
                    ...withCategory(logCategory.systemError),
                    err: error,
                    ...withStorePath(this.filePath),
                },
                "Settings store default file creation failed unexpectedly.",
            );
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
        catch (error) {
            this.logger?.error(
                {
                    ...withCategory(logCategory.systemError),
                    contentBytes: content.length,
                    err: error,
                    ...withStorePath(this.filePath),
                },
                "Settings store file contained invalid TOML.",
            );
            throw new CliUserError("errors.store.invalidToml", 1, {
                path: this.filePath,
            });
        }

        const parsedSettings = settingsFileSchema.safeParse(parsedContent);

        if (!parsedSettings.success) {
            this.logger?.error(
                {
                    ...withCategory(logCategory.systemError),
                    issueCount: parsedSettings.error.issues.length,
                    issuePaths: parsedSettings.error.issues.map(issue =>
                        issue.path.length === 0 ? "(root)" : issue.path.join("."),
                    ),
                    ...withStorePath(this.filePath),
                },
                "Settings store file contained an unsupported schema.",
            );
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

function readConfiguredSettingsKeys(settings: AppSettings): string[] {
    return Object.entries(settings)
        .flatMap(([key, value]) => (value !== undefined ? [key] : []))
        .sort();
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
