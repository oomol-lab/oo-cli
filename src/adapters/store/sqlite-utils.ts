import type { Logger } from "pino";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { constants, Database } from "bun:sqlite";

import { logCategory } from "../../application/logging/log-categories.ts";
import { withCategory, withStorePath } from "../../application/logging/log-fields.ts";

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
// Failures that mean the file itself is not a usable database. Everything the
// database holds is disposable, so such a file is deleted and recreated.
const unusableSqliteFileErrorCodes = ["SQLITE_CORRUPT", "SQLITE_NOTADB"];
const sqliteDatabaseFileSuffixes = ["", "-shm", "-wal"];
const walSwitchRetryMaxDelayMs = 10;

/**
 * The one SQLite database file every sqlite-backed store shares, opened at most
 * once per process.
 *
 * SQLite lets any number of processes hold the file open but only one of them
 * write at a time; the others wait for the write lock. Concurrent `oo`
 * processes therefore stay correct as long as every writer follows three
 * rules, which this class and its callers uphold together:
 *
 * - The connection runs in WAL mode, so readers never block the writer and the
 *   writer never blocks readers.
 * - `busy_timeout` is set before anything else touches the file, so waiting
 *   for another process's write lock is a bounded retry instead of an
 *   immediate SQLITE_BUSY. The one-time switch of a new file to WAL is not
 *   covered by `busy_timeout`, so it is retried here for the same budget.
 * - A write that spans several statements runs inside a `BEGIN IMMEDIATE`
 *   transaction (`connection.transaction(...).immediate()`). It takes the
 *   write lock up front; a deferred transaction that upgrades from reading to
 *   writing fails with SQLITE_BUSY without ever consulting `busy_timeout`.
 */
export class SharedSqliteDatabase {
    private busyTimeoutMs: number | undefined;
    private connection: Database | undefined;

    // The database opens on first use: many invocations never touch it, and
    // opening costs file I/O plus a checkpoint when it is closed.
    constructor(
        private readonly filePath: string,
        private readonly logger?: Logger,
    ) {}

    getFilePath(): string {
        return this.filePath;
    }

    // Lets a read-only caller skip a database that was never created instead of
    // creating it just to find it empty.
    exists(): boolean {
        return this.connection !== undefined || isExistingFile(this.filePath);
    }

    /**
     * Returns the process-wide connection, opening it when needed.
     *
     * `busyTimeoutMs` is how long the caller's next statements may wait for
     * another process's write lock. The stores have different budgets (a
     * best-effort cache write gives up far sooner than a record the user is
     * waiting on), so every caller states its own right before it runs
     * statements instead of inheriting whatever the previous caller chose.
     */
    connect(busyTimeoutMs: number): Database {
        if (this.connection === undefined) {
            this.connection = this.open(busyTimeoutMs);
        }
        else if (this.busyTimeoutMs !== busyTimeoutMs) {
            this.connection.run(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
        }

        this.busyTimeoutMs = busyTimeoutMs;

        return this.connection;
    }

    close(): void {
        const connection = this.connection;

        if (connection === undefined) {
            return;
        }

        this.connection = undefined;
        this.busyTimeoutMs = undefined;

        try {
            try {
                connection.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0);
                // PASSIVE never waits on another process's readers or writer,
                // so closing cannot stall them or be stalled by them.
                connection.run("PRAGMA wal_checkpoint(PASSIVE);");
            }
            catch (error) {
                if (!isRecoverableSqliteError(error)) {
                    throw error;
                }

                this.logger?.debug(
                    {
                        err: error,
                        sqliteErrorCode: error.code,
                        ...withStorePath(this.filePath),
                    },
                    "Sqlite checkpoint skipped after a recoverable failure.",
                );
            }
        }
        finally {
            connection.close();
            this.logger?.debug(
                {
                    ...withStorePath(this.filePath),
                },
                "Sqlite database closed.",
            );
        }
    }

    private open(busyTimeoutMs: number): Database {
        let connection: Database;

        try {
            connection = openConfiguredSqliteDatabase(this.filePath, busyTimeoutMs);
        }
        catch (error) {
            if (!isUnusableSqliteFileError(error)) {
                throw error;
            }

            try {
                removeSqliteDatabaseFiles(this.filePath);
            }
            catch {
                // Another process still holds the file (Windows refuses to
                // delete it), so report the original failure instead.
                throw error;
            }

            this.logger?.warn(
                {
                    ...withCategory(logCategory.systemError),
                    err: error,
                    sqliteErrorCode: error.code,
                    ...withStorePath(this.filePath),
                },
                "Sqlite database file was unusable and has been recreated.",
            );
            connection = openConfiguredSqliteDatabase(this.filePath, busyTimeoutMs);
        }

        this.logger?.debug(
            {
                ...withStorePath(this.filePath),
            },
            "Sqlite database opened.",
        );

        return connection;
    }
}

function openConfiguredSqliteDatabase(
    filePath: string,
    busyTimeoutMs: number,
): Database {
    mkdirSync(dirname(filePath), { recursive: true });

    const database = new Database(filePath, {
        create: true,
        strict: true,
    });
    let configured = false;

    try {
        database.run(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
        switchToWalJournalMode(database, busyTimeoutMs);
        // WAL stays consistent without syncing every commit; skipping that
        // sync keeps each write lock short for the processes waiting on it.
        database.run("PRAGMA synchronous = NORMAL;");
        configured = true;

        return database;
    }
    finally {
        if (!configured) {
            database.close();
        }
    }
}

// A no-op once the file is in WAL mode, which it stays in. On a new file the
// switch reads the header and then upgrades to a write lock, and SQLite never
// consults `busy_timeout` for such an upgrade: while another process is also
// initializing the file it fails with SQLITE_BUSY at once. So the wait that
// `busy_timeout` provides everywhere else is done by hand here.
function switchToWalJournalMode(database: Database, busyTimeoutMs: number): void {
    const deadlineMs = Date.now() + busyTimeoutMs;
    let retried = false;

    while (true) {
        try {
            database.run("PRAGMA journal_mode = WAL;");
            break;
        }
        catch (error) {
            if (
                !isRecoverableSqliteError(error)
                || !isRecoverableSqliteLockCode(error.code)
                || Date.now() >= deadlineMs
            ) {
                throw error;
            }
        }

        // Randomized, so two processes that collided do not retry in step.
        Bun.sleepSync(1 + Math.random() * walSwitchRetryMaxDelayMs);
        // An attempt can still wait inside SQLite for its initial read lock,
        // so a retry only gets what is left of the budget.
        retried = true;
        database.run(
            `PRAGMA busy_timeout = ${Math.max(0, deadlineMs - Date.now())};`,
        );
    }

    if (retried) {
        database.run(`PRAGMA busy_timeout = ${busyTimeoutMs};`);
    }
}

function removeSqliteDatabaseFiles(filePath: string): void {
    for (const suffix of sqliteDatabaseFileSuffixes) {
        rmSync(`${filePath}${suffix}`, { force: true });
    }
}

function isExistingFile(filePath: string): boolean {
    try {
        return statSync(filePath).isFile();
    }
    catch {
        return false;
    }
}

function isUnusableSqliteFileError(error: unknown): error is Error & {
    code: string;
} {
    return isRecoverableSqliteError(error)
        && unusableSqliteFileErrorCodes.some(
            code => matchesSqliteErrorCodeFamily(error.code, code),
        );
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
