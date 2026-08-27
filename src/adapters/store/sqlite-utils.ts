import type { Logger } from "pino";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { constants, Database } from "bun:sqlite";

import { withStorePath } from "../../application/logging/log-fields.ts";

export interface OpenSqliteDatabaseOptions {
    busyTimeoutMs?: number;
}

export interface CloseSqliteDatabaseOptions {
    checkpointMode: "PASSIVE" | "TRUNCATE";
    closedLogMessage: string;
    filePath: string;
    logger?: Logger;
}

// The single registry of SQLite failures a caller may degrade past rather than
// escalate. Matching is by family, so an extended code such as
// SQLITE_IOERR_FSYNC is recognized as the SQLITE_IOERR it is.
const recoverableSqliteLockCodes = new Set([
    "SQLITE_BUSY",
    "SQLITE_LOCKED",
]);
const recoverableSqliteErrorCodes = new Set([
    ...recoverableSqliteLockCodes,
    "SQLITE_CANTOPEN",
    "SQLITE_CORRUPT",
    "SQLITE_FULL",
    "SQLITE_IOERR",
    "SQLITE_NOTADB",
    "SQLITE_READONLY",
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
    options: CloseSqliteDatabaseOptions,
): void {
    const { checkpointMode, closedLogMessage, filePath, logger } = options;

    try {
        try {
            database.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0);
            database.run(`PRAGMA wal_checkpoint(${checkpointMode});`);
        }
        catch (error) {
            if (!isRecoverableSqliteError(error)) {
                throw error;
            }

            logger?.debug(
                {
                    err: error,
                    sqliteErrorCode: error.code,
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
            closedLogMessage,
        );
    }
}

export function isRecoverableSqliteError(error: unknown): error is Error & {
    code: string;
} {
    return error instanceof Error
        && "code" in error
        && typeof error.code === "string"
        && resolveRecoverableSqliteErrorCodeFamily(error.code) !== undefined;
}

export function isRecoverableSqliteLockCode(code: string): boolean {
    for (const recoverableCode of recoverableSqliteLockCodes) {
        if (matchesSqliteErrorCodeFamily(code, recoverableCode)) {
            return true;
        }
    }

    return false;
}

export function resolveRecoverableSqliteErrorCodeFamily(
    code: string,
): string | undefined {
    for (const recoverableCode of recoverableSqliteErrorCodes) {
        if (matchesSqliteErrorCodeFamily(code, recoverableCode)) {
            return recoverableCode;
        }
    }

    return undefined;
}

function matchesSqliteErrorCodeFamily(
    code: string,
    recoverableCode: string,
): boolean {
    return code === recoverableCode || code.startsWith(`${recoverableCode}_`);
}
