import type { Logger } from "pino";
import type {
    FileUploadListOptions,
    FileUploadRecord,
    FileUploadRecordStore,
    FileUploadStatus,
} from "../../application/contracts/file-upload-store.ts";

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { constants, Database } from "bun:sqlite";
import { withStorePath } from "../../application/logging/log-fields.ts";

interface FileUploadRow {
    downloadUrl: string;
    expiresAtMs: number;
    fileName: string;
    fileSize: number;
    id: string;
    uploadedAtMs: number;
}

export const uploadedFilesTableName = "uploaded_files";

export class SqliteFileUploadStore implements FileUploadRecordStore {
    private database: Database | undefined;

    constructor(
        private readonly filePath: string,
        private readonly logger?: Logger,
    ) {}

    getFilePath(): string {
        return this.filePath;
    }

    save(record: FileUploadRecord): void {
        validateFileUploadRecord(record);

        this.getDatabase().query(
            [
                `INSERT INTO ${uploadedFilesTableName} (`,
                "id,",
                "file_name,",
                "file_size,",
                "download_url,",
                "uploaded_at_ms,",
                "expires_at_ms",
                ") VALUES (",
                "$id,",
                "$fileName,",
                "$fileSize,",
                "$downloadUrl,",
                "$uploadedAtMs,",
                "$expiresAtMs",
                ")",
            ].join(" "),
        ).run({
            downloadUrl: record.downloadUrl,
            expiresAtMs: record.expiresAtMs,
            fileName: record.fileName,
            fileSize: record.fileSize,
            id: record.id,
            uploadedAtMs: record.uploadedAtMs,
        });

        this.logger?.debug(
            {
                expiresAtMs: record.expiresAtMs,
                fileName: record.fileName,
                fileSize: record.fileSize,
                id: record.id,
                uploadedAtMs: record.uploadedAtMs,
                ...withStorePath(this.filePath),
            },
            "File upload record stored.",
        );
    }

    list(options: FileUploadListOptions): FileUploadRecord[] {
        const params: Record<string, number> = {
            now: options.now,
        };
        const whereClauses: string[] = [];

        validateQueryTimestamp(options.now);
        validateLimit(options.limit);

        if (options.status === "active") {
            whereClauses.push("expires_at_ms > $now");
        }

        if (options.status === "expired") {
            whereClauses.push("expires_at_ms <= $now");
        }

        if (options.limit !== undefined) {
            params.limit = options.limit;
        }

        let queryText = [
            "SELECT",
            "id AS id,",
            "file_name AS fileName,",
            "file_size AS fileSize,",
            "download_url AS downloadUrl,",
            "uploaded_at_ms AS uploadedAtMs,",
            "expires_at_ms AS expiresAtMs",
            `FROM ${uploadedFilesTableName}`,
        ].join(" ");

        if (whereClauses.length > 0) {
            queryText += ` WHERE ${whereClauses.join(" AND ")}`;
        }

        queryText += " ORDER BY uploaded_at_ms DESC, id DESC";

        if (options.limit !== undefined) {
            queryText += " LIMIT $limit";
        }

        const rows = this.getDatabase().query<FileUploadRow, Record<string, number>>(
            queryText,
        ).all(params);

        this.logger?.debug(
            {
                limit: options.limit,
                now: options.now,
                recordCount: rows.length,
                status: options.status ?? "all",
                ...withStorePath(this.filePath),
            },
            "File upload records listed.",
        );

        return rows;
    }

    deleteExpired(now: number): number {
        validateQueryTimestamp(now);

        const result = this.getDatabase().query(
            [
                `DELETE FROM ${uploadedFilesTableName}`,
                "WHERE expires_at_ms <= $now",
            ].join(" "),
        ).run({
            now,
        });
        const deletedCount = result.changes;

        this.logger?.debug(
            {
                deletedCount,
                now,
                ...withStorePath(this.filePath),
            },
            "Expired file upload records deleted.",
        );

        return deletedCount;
    }

    close(): void {
        const database = this.database;

        if (!database) {
            return;
        }

        this.database = undefined;

        try {
            database.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0);
            database.run("PRAGMA wal_checkpoint(TRUNCATE);");
        }
        finally {
            database.close();
            this.logger?.debug(
                {
                    ...withStorePath(this.filePath),
                },
                "Sqlite file upload store closed.",
            );
        }
    }

    private getDatabase(): Database {
        if (this.database) {
            return this.database;
        }

        this.database = openDatabase(this.filePath);
        this.logger?.debug(
            {
                ...withStorePath(this.filePath),
            },
            "Sqlite file upload store opened.",
        );

        return this.database;
    }
}

export function readFileUploadStatus(
    expiresAtMs: number,
    now: number,
): FileUploadStatus {
    return expiresAtMs <= now ? "expired" : "active";
}

function openDatabase(filePath: string): Database {
    mkdirSync(dirname(filePath), {
        recursive: true,
    });

    const database = new Database(filePath, {
        create: true,
        strict: true,
    });

    database.run("PRAGMA journal_mode = WAL;");
    ensureUploadTable(database);

    return database;
}

function ensureUploadTable(database: Database): void {
    database.run(
        [
            `CREATE TABLE IF NOT EXISTS ${uploadedFilesTableName} (`,
            "id TEXT PRIMARY KEY NOT NULL,",
            "file_name TEXT NOT NULL,",
            "file_size INTEGER NOT NULL,",
            "download_url TEXT NOT NULL,",
            "uploaded_at_ms INTEGER NOT NULL,",
            "expires_at_ms INTEGER NOT NULL",
            ") STRICT",
        ].join(" "),
    );
    database.run(
        [
            `CREATE INDEX IF NOT EXISTS ${uploadedFilesTableName}_expires_at_idx`,
            `ON ${uploadedFilesTableName}(expires_at_ms)`,
        ].join(" "),
    );
    database.run(
        [
            `CREATE INDEX IF NOT EXISTS ${uploadedFilesTableName}_uploaded_at_idx`,
            `ON ${uploadedFilesTableName}(uploaded_at_ms DESC, id DESC)`,
        ].join(" "),
    );
}

function validateFileUploadRecord(record: FileUploadRecord): void {
    if (record.id.trim() === "") {
        throw new Error("File upload record id cannot be empty.");
    }

    if (record.fileName.trim() === "") {
        throw new Error("File upload record fileName cannot be empty.");
    }

    if (!Number.isSafeInteger(record.fileSize) || record.fileSize < 0) {
        throw new Error("File upload record fileSize must be a safe integer.");
    }

    if (record.downloadUrl.trim() === "") {
        throw new Error("File upload record downloadUrl cannot be empty.");
    }

    validateQueryTimestamp(record.uploadedAtMs);
    validateQueryTimestamp(record.expiresAtMs);
}

function validateLimit(limit: number | undefined): void {
    if (
        limit !== undefined
        && (!Number.isSafeInteger(limit) || limit <= 0)
    ) {
        throw new Error("File upload record limit must be a positive integer.");
    }
}

function validateQueryTimestamp(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error("File upload record timestamp must be a safe integer.");
    }
}
