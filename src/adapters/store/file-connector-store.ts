import type { Logger } from "pino";
import type { ConnectorStore } from "../../application/contracts/connector-store.ts";
import type { ConnectorFile } from "../../application/schemas/connector.ts";
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
    connectorTomlFileSchema,
    defaultConnectorFile,
    renderConnectorFile,
} from "../../application/schemas/connector.ts";
import { isFileMissingError } from "../../application/shared/fs-errors.ts";
import { defaultConnectorFileName, resolveStoreDirectory } from "./store-path.ts";

interface FileConnectorStoreSharedOptions {
    logger?: Logger;
}

interface FileConnectorStoreLocationOptions
    extends FileStoreLocationOptions, FileConnectorStoreSharedOptions {
    fileName?: string;
}

interface FileConnectorStorePathOptions extends FileConnectorStoreSharedOptions {
    filePath: string;
}

export type FileConnectorStoreOptions
    = FileConnectorStoreLocationOptions
        | FileConnectorStorePathOptions;

export class FileConnectorStore implements ConnectorStore {
    private readonly filePath: string;
    private readonly logger?: Logger;

    constructor(options: FileConnectorStoreOptions) {
        this.filePath = resolveConnectorFilePath(options);
        this.logger = options.logger;
    }

    getFilePath(): string {
        return this.filePath;
    }

    async read(): Promise<ConnectorFile> {
        try {
            const connectorFile = await this.readPersistedConnectorFile();

            this.logger?.debug(
                {
                    hasSelfHostedConnector: connectorFile.selfHosted !== undefined,
                    ...withStorePath(this.filePath),
                },
                "Connector store read completed.",
            );

            return connectorFile;
        }
        catch (error) {
            if (error instanceof CliUserError) {
                throw error;
            }

            // A missing file simply means no self-hosted connector has been
            // configured; unlike the auth store, no default file is created so
            // untouched installations never gain an extra config file.
            if (isFileMissingError(error)) {
                this.logger?.debug(
                    {
                        ...withStorePath(this.filePath),
                    },
                    "Connector store file is missing; treating it as unconfigured.",
                );
                return defaultConnectorFile;
            }

            this.logger?.error(
                {
                    ...withCategory(logCategory.systemError),
                    err: error,
                    ...withStorePath(this.filePath),
                },
                "Connector store read failed unexpectedly.",
            );
            throw new CliUserError("errors.connectorStore.readFailed", 1, {
                path: this.filePath,
            });
        }
    }

    async write(connectorFile: ConnectorFile): Promise<ConnectorFile> {
        const renderedConnectorFile = renderConnectorFile(connectorFile);
        const directory = dirname(this.filePath);
        const temporaryFilePath = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;

        try {
            await mkdir(directory, { recursive: true });
            await writeFile(
                temporaryFilePath,
                renderedConnectorFile,
                "utf8",
            );
            await rename(temporaryFilePath, this.filePath);

            const parsedConnectorFile = connectorTomlFileSchema.parse(
                parseToml(renderedConnectorFile),
            );

            this.logger?.info(
                {
                    hasSelfHostedConnector:
                        parsedConnectorFile.selfHosted !== undefined,
                    ...withStorePath(this.filePath),
                },
                "Connector store write completed.",
            );

            return parsedConnectorFile;
        }
        catch (error) {
            await rm(temporaryFilePath, { force: true }).catch(() => undefined);

            this.logger?.error(
                {
                    ...withCategory(logCategory.systemError),
                    err: error,
                    ...withStorePath(this.filePath),
                },
                "Connector store write failed unexpectedly.",
            );
            throw new CliUserError("errors.connectorStore.writeFailed", 1, {
                path: this.filePath,
            });
        }
    }

    async update(
        updater: (connectorFile: ConnectorFile) => ConnectorFile,
    ): Promise<ConnectorFile> {
        const currentConnectorFile = await this.read();
        const nextConnectorFile = updater(currentConnectorFile);

        return this.write(nextConnectorFile);
    }

    private async readPersistedConnectorFile(): Promise<ConnectorFile> {
        const content = await readFile(this.filePath, "utf8");

        let parsedContent: unknown;

        try {
            parsedContent = parseToml(content);
        }
        catch {
            // The TOML parse error is deliberately not logged: its message
            // embeds the offending document lines, which may contain the
            // runtime token.
            this.logger?.error(
                {
                    ...withCategory(logCategory.systemError),
                    contentBytes: content.length,
                    ...withStorePath(this.filePath),
                },
                "Connector store file contained invalid TOML.",
            );
            throw new CliUserError("errors.connectorStore.invalidToml", 1, {
                path: this.filePath,
            });
        }

        const parsedConnectorFile = connectorTomlFileSchema.safeParse(parsedContent);

        if (!parsedConnectorFile.success) {
            this.logger?.error(
                {
                    ...withCategory(logCategory.systemError),
                    issueCount: parsedConnectorFile.error.issues.length,
                    issuePaths: parsedConnectorFile.error.issues.map(issue =>
                        issue.path.length === 0 ? "(root)" : issue.path.join("."),
                    ),
                    ...withStorePath(this.filePath),
                },
                "Connector store file contained an unsupported schema.",
            );
            throw new CliUserError("errors.connectorStore.invalidSchema", 1, {
                path: this.filePath,
            });
        }

        return parsedConnectorFile.data;
    }
}

function resolveConnectorFilePath(options: FileConnectorStoreOptions): string {
    if ("filePath" in options) {
        return options.filePath;
    }

    return join(
        resolveStoreDirectory(options),
        options.fileName ?? defaultConnectorFileName,
    );
}
