import type { Logger } from "pino";
import type {
    Cache,
    CacheOptions,
    CacheSetOptions,
    CacheStore,
} from "../../application/contracts/cache.ts";

import { createHash } from "node:crypto";
import { accessSync, constants as fsConstants, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { Database, constants as sqliteConstants } from "bun:sqlite";
import { logCategory } from "../../application/logging/log-categories.ts";
import {
    withCacheId,
    withCategory,
    withKeyFingerprint,
    withStorePath,
} from "../../application/logging/log-fields.ts";

interface CacheRow {
    value: string;
}

type CacheLookupParams = Record<string, string | number | null> & {
    key: string;
    now: number;
};

interface SqliteCacheOptionsInternal {
    database: Database;
    defaultTtlMs?: number;
    filePath: string;
    id: string;
    logger?: Logger;
    maxEntries?: number;
    now: () => number;
}

interface RecoverableSqliteOperationResult<Value> {
    succeeded: boolean;
    value: Value;
}

interface StorePathDiagnostics {
    parentDirectoryExists: boolean;
    parentDirectoryPath: string;
    parentDirectoryReadable: boolean;
    parentDirectoryWritable: boolean;
    storePathExists: boolean;
    storePathKind: "directory" | "file" | "missing" | "other";
}

const recoverableSqliteLockCodes = new Set([
    "SQLITE_BUSY",
    "SQLITE_LOCKED",
]);
const recoverableSqliteCacheErrorCodes = new Set([
    ...recoverableSqliteLockCodes,
    "SQLITE_CANTOPEN",
    "SQLITE_CORRUPT",
    "SQLITE_FULL",
    "SQLITE_IOERR",
    "SQLITE_NOTADB",
    "SQLITE_READONLY",
]);
const sqliteBusyTimeoutMs = 250;

export class SqliteCacheStore implements CacheStore {
    private database: Database | undefined;
    private readonly filePath: string;
    private readonly logger?: Logger;

    constructor(filePath: string, logger?: Logger) {
        this.filePath = filePath;
        this.logger = logger;

        try {
            this.database = openDatabase(filePath);
            this.logger?.debug(
                {
                    ...withStorePath(this.filePath),
                },
                "Sqlite cache store opened.",
            );
        }
        catch (error) {
            if (!isRecoverableSqliteCacheError(error)) {
                throw error;
            }

            this.database = undefined;
            this.logger?.warn(
                {
                    ...withCategory(logCategory.recoverableCache),
                    err: error,
                    ...readStorePathDiagnostics(this.filePath),
                    sqliteErrorCode: error.code,
                    ...withStorePath(this.filePath),
                },
                `Sqlite cache store open was deferred because ${describeRecoverableSqliteCacheError(error)}.`,
            );
        }
    }

    getFilePath(): string {
        return this.filePath;
    }

    getCache<Value>(options: CacheOptions): Cache<Value> {
        this.logger?.debug(
            {
                ...withCacheId(options.id),
                defaultTtlMs: options.defaultTtlMs,
                maxEntries: options.maxEntries,
                ...withStorePath(this.filePath),
            },
            "Sqlite cache namespace opened.",
        );

        try {
            return new SqliteCache<Value>({
                database: this.getDatabase(),
                defaultTtlMs: options.defaultTtlMs,
                filePath: this.filePath,
                id: options.id,
                logger: this.logger,
                maxEntries: options.maxEntries,
                now: options.now ?? (() => Date.now()),
            });
        }
        catch (error) {
            if (!isRecoverableSqliteCacheError(error)) {
                throw error;
            }

            this.logger?.warn(
                {
                    ...withCacheId(options.id),
                    ...withCategory(logCategory.recoverableCache),
                    err: error,
                    ...readStorePathDiagnostics(this.filePath),
                    sqliteErrorCode: error.code,
                    ...withStorePath(this.filePath),
                },
                `Sqlite cache namespace is temporarily unavailable because ${describeRecoverableSqliteCacheError(error)}.`,
            );

            return new UnavailableSqliteCache<Value>();
        }
    }

    close(): void {
        const database = this.database;

        if (!database) {
            return;
        }

        this.database = undefined;

        try {
            try {
                database.fileControl(sqliteConstants.SQLITE_FCNTL_PERSIST_WAL, 0);
                database.run("PRAGMA wal_checkpoint(TRUNCATE);");
            }
            catch (error) {
                if (!isRecoverableSqliteCacheError(error)) {
                    throw error;
                }

                this.logger?.debug(
                    {
                        ...withCategory(logCategory.recoverableCache),
                        err: error,
                        sqliteErrorCode: error.code,
                        ...withStorePath(this.filePath),
                    },
                    `Sqlite cache store close skipped WAL checkpoint because ${describeRecoverableSqliteCacheError(error)}.`,
                );
            }
        }
        finally {
            database.close();
            this.logger?.debug(
                {
                    ...withStorePath(this.filePath),
                },
                "Sqlite cache store closed.",
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
            "Sqlite cache store reopened.",
        );

        return this.database;
    }
}

export class SqliteCache<Value> implements Cache<Value> {
    private readonly tableName: string;
    private readonly selectFreshStatement;
    private readonly touchStatement;
    private readonly upsertStatement;
    private readonly deleteStatement;
    private readonly clearStatement;
    private readonly deleteExpiredStatement;
    private readonly evictLeastRecentlyUsedStatement;

    constructor(private readonly options: SqliteCacheOptionsInternal) {
        validateCacheId(options.id);
        validateMaxEntries(options.maxEntries);
        validateTtl(options.defaultTtlMs, "defaultTtlMs");

        this.tableName = resolveSqliteCacheTableName(options.id);
        ensureCacheTable(options.database, this.tableName);

        this.selectFreshStatement = options.database.query<
            CacheRow,
            CacheLookupParams
        >(
            [
                `SELECT cache_value AS value`,
                `FROM ${this.tableName}`,
                `WHERE cache_key = $key`,
                `AND (expires_at_ms IS NULL OR expires_at_ms > $now)`,
            ].join(" "),
        );
        this.touchStatement = options.database.query(
            [
                `UPDATE ${this.tableName}`,
                `SET accessed_at_ms = $now`,
                `WHERE cache_key = $key`,
                `AND (expires_at_ms IS NULL OR expires_at_ms > $now)`,
            ].join(" "),
        );
        this.upsertStatement = options.database.query(
            [
                `INSERT INTO ${this.tableName} (`,
                "cache_key,",
                "cache_value,",
                "expires_at_ms,",
                "created_at_ms,",
                "updated_at_ms,",
                "accessed_at_ms",
                ") VALUES (",
                "$key,",
                "$value,",
                "$expiresAtMs,",
                "$now,",
                "$now,",
                "$now",
                ")",
                "ON CONFLICT(cache_key) DO UPDATE SET",
                "cache_value = excluded.cache_value,",
                "expires_at_ms = excluded.expires_at_ms,",
                "updated_at_ms = excluded.updated_at_ms,",
                "accessed_at_ms = excluded.accessed_at_ms",
            ].join(" "),
        );
        this.deleteStatement = options.database.query(
            `DELETE FROM ${this.tableName} WHERE cache_key = $key`,
        );
        this.clearStatement = options.database.query(
            `DELETE FROM ${this.tableName}`,
        );
        this.deleteExpiredStatement = options.database.query(
            [
                `DELETE FROM ${this.tableName}`,
                "WHERE expires_at_ms IS NOT NULL",
                "AND expires_at_ms <= $now",
            ].join(" "),
        );
        this.evictLeastRecentlyUsedStatement = options.database.query(
            [
                `DELETE FROM ${this.tableName}`,
                "WHERE rowid IN (",
                "SELECT rowid",
                `FROM ${this.tableName}`,
                "ORDER BY accessed_at_ms DESC, updated_at_ms DESC, cache_key DESC",
                "LIMIT -1 OFFSET $maxEntries",
                ")",
            ].join(" "),
        );
    }

    get(key: string): Value | null {
        const now = this.options.now();
        const rowResult = this.attemptRecoverableSqliteOperation({
            fallback: null,
            key,
            messagePrefix: "Sqlite cache lookup was skipped",
            operation: "get",
        }, () => this.selectFreshStatement.get({ key, now }));

        if (!rowResult.succeeded) {
            return null;
        }

        const row = rowResult.value;

        if (row === null) {
            this.options.logger?.debug(
                {
                    ...withCacheId(this.options.id),
                    ...withKeyFingerprint(createCacheKeyFingerprint(key)),
                },
                "Sqlite cache lookup missed.",
            );
            return null;
        }

        let value: Value;

        try {
            value = deserializeCacheValue<Value>(row.value);
        }
        catch (error) {
            const deletedResult = this.attemptRecoverableSqliteOperation({
                fallback: false,
                key,
                messagePrefix: "Sqlite cache invalid entry eviction was skipped",
                operation: "delete-invalid",
            }, () => this.deleteStatement.run({ key }).changes > 0);
            const deleted = deletedResult.value;

            this.options.logger?.warn(
                {
                    ...withCacheId(this.options.id),
                    ...withCategory(logCategory.recoverableCache),
                    deleted,
                    err: error,
                    ...withKeyFingerprint(createCacheKeyFingerprint(key)),
                },
                "Sqlite cache entry was invalid and has been evicted.",
            );

            return null;
        }

        this.attemptRecoverableSqliteOperation({
            fallback: undefined,
            key,
            messagePrefix: "Sqlite cache touch update was skipped",
            operation: "touch",
        }, () => {
            this.touchStatement.run({ key, now });
        });
        this.options.logger?.debug(
            {
                ...withCacheId(this.options.id),
                ...withKeyFingerprint(createCacheKeyFingerprint(key)),
            },
            "Sqlite cache lookup hit.",
        );

        return value;
    }

    set(key: string, value: Value, options: CacheSetOptions = {}): void {
        const now = this.options.now();
        const ttlMs = resolveTtlMs(options.ttlMs, this.options.defaultTtlMs);
        const expiresAtMs = ttlMs === undefined ? null : now + ttlMs;

        const storeResult = this.attemptRecoverableSqliteOperation({
            fallback: undefined,
            key,
            messagePrefix: "Sqlite cache store was skipped",
            operation: "set",
        }, () => {
            this.upsertStatement.run({
                key,
                value: serializeCacheValue(value),
                expiresAtMs,
                now,
            });
            this.deleteExpiredStatement.run({ now });

            if (this.options.maxEntries !== undefined) {
                this.evictLeastRecentlyUsedStatement.run({
                    maxEntries: this.options.maxEntries,
                });
            }
        });

        if (!storeResult.succeeded) {
            return;
        }

        this.options.logger?.debug(
            {
                ...withCacheId(this.options.id),
                expiresAtMs,
                ...withKeyFingerprint(createCacheKeyFingerprint(key)),
                ttlMs,
            },
            "Sqlite cache value stored.",
        );
    }

    has(key: string): boolean {
        return this.get(key) !== null;
    }

    delete(key: string): boolean {
        const deletedResult = this.attemptRecoverableSqliteOperation({
            fallback: false,
            key,
            messagePrefix: "Sqlite cache delete was skipped",
            operation: "delete",
        }, () => this.deleteStatement.run({ key }).changes > 0);

        if (!deletedResult.succeeded) {
            return false;
        }

        const deleted = deletedResult.value;

        this.options.logger?.debug(
            {
                ...withCacheId(this.options.id),
                deleted,
                ...withKeyFingerprint(createCacheKeyFingerprint(key)),
            },
            "Sqlite cache delete completed.",
        );

        return deleted;
    }

    clear(): void {
        const clearResult = this.attemptRecoverableSqliteOperation({
            fallback: undefined,
            messagePrefix: "Sqlite cache clear was skipped",
            operation: "clear",
        }, () => {
            this.clearStatement.run();
        });

        if (!clearResult.succeeded) {
            return;
        }

        this.options.logger?.info(
            {
                ...withCacheId(this.options.id),
            },
            "Sqlite cache namespace cleared.",
        );
    }

    private attemptRecoverableSqliteOperation<Result>(options: {
        fallback: Result;
        key?: string;
        messagePrefix: string;
        operation: string;
    }, run: () => Result): RecoverableSqliteOperationResult<Result> {
        try {
            return {
                succeeded: true,
                value: run(),
            };
        }
        catch (error) {
            if (!isRecoverableSqliteCacheError(error)) {
                throw error;
            }

            this.options.logger?.warn(
                {
                    ...withCacheId(this.options.id),
                    ...withCategory(logCategory.recoverableCache),
                    err: error,
                    operation: options.operation,
                    ...(recoverableSqliteLockCodes.has(error.code)
                        ? {}
                        : readStorePathDiagnostics(this.options.filePath)),
                    sqliteErrorCode: error.code,
                    ...withStorePath(this.options.filePath),
                    ...(options.key === undefined
                        ? {}
                        : withKeyFingerprint(createCacheKeyFingerprint(options.key))),
                },
                `${options.messagePrefix} because ${describeRecoverableSqliteCacheError(error)}.`,
            );

            return {
                succeeded: false,
                value: options.fallback,
            };
        }
    }
}

class UnavailableSqliteCache<Value> implements Cache<Value> {
    get(_key: string): Value | null {
        return null;
    }

    set(_key: string, _value: Value, _options: CacheSetOptions = {}): void {}

    has(_key: string): boolean {
        return false;
    }

    delete(_key: string): boolean {
        return false;
    }

    clear(): void {}
}

export function resolveSqliteCacheTableName(id: string): string {
    validateCacheId(id);
    return `cache_${createHash("sha256").update(id).digest("hex")}`;
}

function openDatabase(filePath: string): Database {
    mkdirSync(dirname(filePath), { recursive: true });

    const database = new Database(filePath, {
        create: true,
        strict: true,
    });

    database.run(`PRAGMA busy_timeout = ${sqliteBusyTimeoutMs};`);
    database.run("PRAGMA journal_mode = WAL;");

    return database;
}

function ensureCacheTable(database: Database, tableName: string): void {
    database.run(
        [
            `CREATE TABLE IF NOT EXISTS ${tableName} (`,
            "cache_key TEXT PRIMARY KEY,",
            "cache_value TEXT NOT NULL,",
            "expires_at_ms INTEGER,",
            "created_at_ms INTEGER NOT NULL,",
            "updated_at_ms INTEGER NOT NULL,",
            "accessed_at_ms INTEGER NOT NULL",
            ")",
        ].join(" "),
    );
    database.run(
        [
            `CREATE INDEX IF NOT EXISTS ${tableName}_expires_at_idx`,
            `ON ${tableName} (expires_at_ms)`,
        ].join(" "),
    );
    database.run(
        [
            `CREATE INDEX IF NOT EXISTS ${tableName}_accessed_at_idx`,
            `ON ${tableName} (accessed_at_ms DESC, updated_at_ms DESC)`,
        ].join(" "),
    );
}

function validateCacheId(id: string): void {
    if (id !== "") {
        return;
    }

    throw new TypeError("SqliteCache requires a non-empty id.");
}

function validateMaxEntries(maxEntries?: number): void {
    if (maxEntries === undefined) {
        return;
    }

    if (Number.isInteger(maxEntries) && maxEntries > 0) {
        return;
    }

    throw new TypeError("SqliteCache maxEntries must be a positive integer.");
}

function validateTtl(ttlMs: number | undefined, label: string): void {
    if (ttlMs === undefined) {
        return;
    }

    if (Number.isFinite(ttlMs) && ttlMs >= 0) {
        return;
    }

    throw new TypeError(`${label} must be a finite number greater than or equal to 0.`);
}

function resolveTtlMs(
    ttlMs: number | undefined,
    defaultTtlMs: number | undefined,
): number | undefined {
    const resolvedTtlMs = ttlMs ?? defaultTtlMs;

    validateTtl(resolvedTtlMs, "ttlMs");

    return resolvedTtlMs;
}

function serializeCacheValue<Value>(value: Value): string {
    const serializedValue = JSON.stringify(value);

    if (serializedValue !== undefined) {
        return serializedValue;
    }

    throw new TypeError("SqliteCache does not support undefined values.");
}

function deserializeCacheValue<Value>(value: string): Value {
    return JSON.parse(value) as Value;
}

function createCacheKeyFingerprint(key: string): string {
    return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

function isRecoverableSqliteCacheError(
    error: unknown,
): error is Error & {
    code: string;
} {
    return error instanceof Error
        && "code" in error
        && typeof error.code === "string"
        && recoverableSqliteCacheErrorCodes.has(error.code);
}

function describeRecoverableSqliteCacheError(
    error: Error & {
        code: string;
    },
): string {
    if (recoverableSqliteLockCodes.has(error.code)) {
        return "the database is locked";
    }

    switch (error.code) {
        case "SQLITE_CANTOPEN":
            return "the database file cannot be opened";
        case "SQLITE_CORRUPT":
            return "the database file is corrupted";
        case "SQLITE_FULL":
            return "the database file is full";
        case "SQLITE_IOERR":
            return "the database file is unavailable";
        case "SQLITE_NOTADB":
            return "the database file is invalid";
        case "SQLITE_READONLY":
            return "the database is read-only";
        default:
            return "the database is unavailable";
    }
}

function readStorePathDiagnostics(filePath: string): StorePathDiagnostics {
    const parentDirectoryPath = dirname(filePath);

    return {
        parentDirectoryExists: pathExists(parentDirectoryPath),
        parentDirectoryPath,
        parentDirectoryReadable: pathHasAccess(parentDirectoryPath, fsConstants.R_OK),
        parentDirectoryWritable: pathHasAccess(parentDirectoryPath, fsConstants.W_OK),
        storePathExists: pathExists(filePath),
        storePathKind: readStorePathKind(filePath),
    };
}

function pathExists(path: string): boolean {
    try {
        statSync(path);
        return true;
    }
    catch {
        return false;
    }
}

function pathHasAccess(path: string, mode: number): boolean {
    try {
        accessSync(path, mode);
        return true;
    }
    catch {
        return false;
    }
}

function readStorePathKind(
    path: string,
): StorePathDiagnostics["storePathKind"] {
    try {
        const entry = statSync(path);

        if (entry.isFile()) {
            return "file";
        }

        if (entry.isDirectory()) {
            return "directory";
        }

        return "other";
    }
    catch {
        return "missing";
    }
}
