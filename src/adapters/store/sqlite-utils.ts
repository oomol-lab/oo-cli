import type { Logger } from "pino";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { constants, Database } from "bun:sqlite";

import { withStorePath } from "../../application/logging/log-fields.ts";

export interface OpenSqliteDatabaseOptions {
    busyTimeoutMs?: number;
}

const recoverableSqliteErrorCodes = new Set([
    "SQLITE_BUSY",
    "SQLITE_LOCKED",
    "SQLITE_CANTOPEN",
    "SQLITE_CORRUPT",
    "SQLITE_IOERR",
    "SQLITE_NOTADB",
    "SQLITE_READONLY",
    "SQLITE_FULL",
]);

export function openSqliteDatabase(
    filePath: string,
    options?: OpenSqliteDatabaseOptions,
): Database {
    mkdirSync(dirname(filePath), { recursive: true });

    const database = new Database(filePath, {
        create: true,
        strict: true,
    });
    let configured = false;

    try {
        if (options?.busyTimeoutMs !== undefined) {
            database.run(`PRAGMA busy_timeout = ${options.busyTimeoutMs};`);
        }

        database.run("PRAGMA journal_mode = WAL;");
        configured = true;

        return database;
    }
    finally {
        if (!configured) {
            database.close();
        }
    }
}

export function closeSqliteDatabase(
    database: Database,
    logger: Logger | undefined,
    filePath: string,
    logMessage: string,
): void {
    try {
        try {
            database.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0);
            database.run("PRAGMA wal_checkpoint(PASSIVE);");
        }
        catch (error) {
            if (!isRecoverableSqliteError(error)) {
                throw error;
            }

            logger?.debug(
                {
                    error,
                    ...withStorePath(filePath),
                },
                "Sqlite checkpoint skipped after a recoverable failure.",
            );
        }
    }
    finally {
        database.close();
        logger?.debug(
            {
                ...withStorePath(filePath),
            },
            logMessage,
        );
    }
}

export function isRecoverableSqliteError(error: unknown): boolean {
    if (!(error instanceof Error) || !("code" in error)) {
        return false;
    }

    return recoverableSqliteErrorCodes.has(String(error.code));
}

export function validateQueryTimestamp(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${label} timestamp must be a safe integer.`);
    }
}
