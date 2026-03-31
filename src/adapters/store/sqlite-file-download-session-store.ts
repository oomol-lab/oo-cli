import type { Database } from "bun:sqlite";
import type { Logger } from "pino";

import type {
    FileDownloadSessionKey,
    FileDownloadSessionRecord,
    FileDownloadSessionStore,
} from "../../application/contracts/file-download-session-store.ts";
import { withStorePath } from "../../application/logging/log-fields.ts";
import { closeSqliteDatabase, openSqliteDatabase, validateQueryTimestamp } from "./sqlite-utils.ts";

interface FileDownloadSessionRow {
    entityTag: string;
    finalUrl: string;
    id: string;
    lastModified: string;
    outDirPath: string;
    requestUrl: string;
    requestedExtension: string;
    requestedName: string;
    resolvedBaseName: string;
    resolvedExtension: string;
    tempFileName: string;
    totalBytes: number | null;
    updatedAtMs: number;
}

export const downloadResumeSessionsTableName = "download_resume_sessions";

export class SqliteFileDownloadSessionStore implements FileDownloadSessionStore {
    private database: Database | undefined;

    constructor(
        private readonly filePath: string,
        private readonly logger?: Logger,
    ) {}

    getFilePath(): string {
        return this.filePath;
    }

    findDownloadSession(
        key: FileDownloadSessionKey,
    ): FileDownloadSessionRecord | undefined {
        validateDownloadSessionKey(key);

        const row = this.getDatabase().query<
            FileDownloadSessionRow,
            {
                outDirPath: string;
                requestUrl: string;
                requestedExtension: string;
                requestedName: string;
            }
        >(
            [
                "SELECT",
                "id AS id,",
                "request_url AS requestUrl,",
                "out_dir_path AS outDirPath,",
                "requested_name AS requestedName,",
                "requested_extension AS requestedExtension,",
                "resolved_base_name AS resolvedBaseName,",
                "resolved_extension AS resolvedExtension,",
                "temp_file_name AS tempFileName,",
                "final_url AS finalUrl,",
                "entity_tag AS entityTag,",
                "last_modified AS lastModified,",
                "total_bytes AS totalBytes,",
                "updated_at_ms AS updatedAtMs",
                `FROM ${downloadResumeSessionsTableName}`,
                "WHERE request_url = $requestUrl",
                "AND out_dir_path = $outDirPath",
                "AND requested_name = $requestedName",
                "AND requested_extension = $requestedExtension",
                "LIMIT 1",
            ].join(" "),
        ).get({
            outDirPath: key.outDirPath,
            requestUrl: key.requestUrl,
            requestedExtension: key.requestedExtension,
            requestedName: key.requestedName,
        });

        if (row === null) {
            return undefined;
        }

        return {
            entityTag: row.entityTag,
            finalUrl: row.finalUrl,
            id: row.id,
            lastModified: row.lastModified,
            outDirPath: row.outDirPath,
            requestUrl: row.requestUrl,
            requestedExtension: row.requestedExtension,
            requestedName: row.requestedName,
            resolvedBaseName: row.resolvedBaseName,
            resolvedExtension: row.resolvedExtension,
            tempFileName: row.tempFileName,
            totalBytes: row.totalBytes ?? undefined,
            updatedAtMs: row.updatedAtMs,
        };
    }

    saveDownloadSession(record: FileDownloadSessionRecord): void {
        validateDownloadSessionRecord(record);

        this.getDatabase().query(
            [
                `INSERT INTO ${downloadResumeSessionsTableName} (`,
                "id,",
                "request_url,",
                "out_dir_path,",
                "requested_name,",
                "requested_extension,",
                "resolved_base_name,",
                "resolved_extension,",
                "temp_file_name,",
                "final_url,",
                "entity_tag,",
                "last_modified,",
                "total_bytes,",
                "updated_at_ms",
                ") VALUES (",
                "$id,",
                "$requestUrl,",
                "$outDirPath,",
                "$requestedName,",
                "$requestedExtension,",
                "$resolvedBaseName,",
                "$resolvedExtension,",
                "$tempFileName,",
                "$finalUrl,",
                "$entityTag,",
                "$lastModified,",
                "$totalBytes,",
                "$updatedAtMs",
                ")",
                "ON CONFLICT(id) DO UPDATE SET",
                "request_url = excluded.request_url,",
                "out_dir_path = excluded.out_dir_path,",
                "requested_name = excluded.requested_name,",
                "requested_extension = excluded.requested_extension,",
                "resolved_base_name = excluded.resolved_base_name,",
                "resolved_extension = excluded.resolved_extension,",
                "temp_file_name = excluded.temp_file_name,",
                "final_url = excluded.final_url,",
                "entity_tag = excluded.entity_tag,",
                "last_modified = excluded.last_modified,",
                "total_bytes = excluded.total_bytes,",
                "updated_at_ms = excluded.updated_at_ms",
            ].join(" "),
        ).run({
            entityTag: record.entityTag,
            finalUrl: record.finalUrl,
            id: record.id,
            lastModified: record.lastModified,
            outDirPath: record.outDirPath,
            requestUrl: record.requestUrl,
            requestedExtension: record.requestedExtension,
            requestedName: record.requestedName,
            resolvedBaseName: record.resolvedBaseName,
            resolvedExtension: record.resolvedExtension,
            tempFileName: record.tempFileName,
            totalBytes: record.totalBytes ?? null,
            updatedAtMs: record.updatedAtMs,
        });

        this.logger?.debug(
            {
                id: record.id,
                outDirPath: record.outDirPath,
                requestUrl: record.requestUrl,
                tempFileName: record.tempFileName,
                totalBytes: record.totalBytes ?? null,
                updatedAtMs: record.updatedAtMs,
                ...withStorePath(this.filePath),
            },
            "File download resume session stored.",
        );
    }

    deleteDownloadSession(id: string): boolean {
        if (id.trim() === "") {
            throw new Error("Download session id cannot be empty.");
        }

        const deleted = this.getDatabase().query(
            [
                `DELETE FROM ${downloadResumeSessionsTableName}`,
                "WHERE id = $id",
            ].join(" "),
        ).run({
            id,
        }).changes > 0;

        this.logger?.debug(
            {
                deleted,
                id,
                ...withStorePath(this.filePath),
            },
            "File download resume session deleted.",
        );

        return deleted;
    }

    deleteDownloadSessionsUpdatedBefore(cutoffMs: number): number {
        validateQueryTimestamp(cutoffMs, "Download session");

        const deletedCount = this.getDatabase().query(
            [
                `DELETE FROM ${downloadResumeSessionsTableName}`,
                "WHERE updated_at_ms < $cutoffMs",
            ].join(" "),
        ).run({
            cutoffMs,
        }).changes;

        this.logger?.debug(
            {
                cutoffMs,
                deletedCount,
                ...withStorePath(this.filePath),
            },
            "Stale file download resume sessions deleted.",
        );

        return deletedCount;
    }

    close(): void {
        const database = this.database;

        if (!database) {
            return;
        }

        this.database = undefined;
        closeSqliteDatabase(database, this.logger, this.filePath, "Sqlite file download session store closed.");
    }

    private getDatabase(): Database {
        if (this.database) {
            return this.database;
        }

        const database = openSqliteDatabase(this.filePath);
        ensureDownloadSessionTable(database);
        this.database = database;
        this.logger?.debug(
            {
                ...withStorePath(this.filePath),
            },
            "Sqlite file download session store opened.",
        );

        return this.database;
    }
}

function ensureDownloadSessionTable(database: Database): void {
    database.run(
        [
            `CREATE TABLE IF NOT EXISTS ${downloadResumeSessionsTableName} (`,
            "id TEXT PRIMARY KEY NOT NULL,",
            "request_url TEXT NOT NULL,",
            "out_dir_path TEXT NOT NULL,",
            "requested_name TEXT NOT NULL,",
            "requested_extension TEXT NOT NULL,",
            "resolved_base_name TEXT NOT NULL,",
            "resolved_extension TEXT NOT NULL,",
            "temp_file_name TEXT NOT NULL,",
            "final_url TEXT NOT NULL,",
            "entity_tag TEXT NOT NULL,",
            "last_modified TEXT NOT NULL,",
            "total_bytes INTEGER,",
            "updated_at_ms INTEGER NOT NULL",
            ") STRICT",
        ].join(" "),
    );
    database.run(
        [
            `CREATE UNIQUE INDEX IF NOT EXISTS ${downloadResumeSessionsTableName}_request_key_idx`,
            `ON ${downloadResumeSessionsTableName}(`,
            "request_url,",
            "out_dir_path,",
            "requested_name,",
            "requested_extension",
            ")",
        ].join(" "),
    );
    database.run(
        [
            `CREATE INDEX IF NOT EXISTS ${downloadResumeSessionsTableName}_updated_at_idx`,
            `ON ${downloadResumeSessionsTableName}(updated_at_ms DESC, id DESC)`,
        ].join(" "),
    );
}

function validateDownloadSessionKey(key: FileDownloadSessionKey): void {
    if (key.requestUrl.trim() === "") {
        throw new Error("Download session requestUrl cannot be empty.");
    }

    if (key.outDirPath.trim() === "") {
        throw new Error("Download session outDirPath cannot be empty.");
    }
}

function validateDownloadSessionRecord(record: FileDownloadSessionRecord): void {
    if (record.id.trim() === "") {
        throw new Error("Download session id cannot be empty.");
    }

    validateDownloadSessionKey(record);

    if (record.resolvedBaseName.trim() === "") {
        throw new Error("Download session resolvedBaseName cannot be empty.");
    }

    if (record.tempFileName.trim() === "") {
        throw new Error("Download session tempFileName cannot be empty.");
    }

    if (record.finalUrl.trim() === "") {
        throw new Error("Download session finalUrl cannot be empty.");
    }

    if (
        record.totalBytes !== undefined
        && (!Number.isSafeInteger(record.totalBytes) || record.totalBytes < 0)
    ) {
        throw new Error("Download session totalBytes must be a safe integer.");
    }

    validateQueryTimestamp(record.updatedAtMs, "Download session");
}
