import type { Logger } from "pino";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { constants, Database } from "bun:sqlite";

import { withStorePath } from "../../application/logging/log-fields.ts";

export interface OpenSqliteDatabaseOptions {
    busyTimeoutMs?: number;
}

export function openSqliteDatabase(
    filePath: string,
    options?: OpenSqliteDatabaseOptions,
): Database {
    mkdirSync(dirname(filePath), { recursive: true });

    const database = new Database(filePath, {
        create: true,
        strict: true,
    });

    if (options?.busyTimeoutMs !== undefined) {
        database.run(`PRAGMA busy_timeout = ${options.busyTimeoutMs};`);
    }

    database.run("PRAGMA journal_mode = WAL;");

    return database;
}

export function closeSqliteDatabase(
    database: Database,
    logger: Logger | undefined,
    filePath: string,
    logMessage: string,
): void {
    try {
        database.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0);
        database.run("PRAGMA wal_checkpoint(TRUNCATE);");
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

export function validateQueryTimestamp(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${label} timestamp must be a safe integer.`);
    }
}
