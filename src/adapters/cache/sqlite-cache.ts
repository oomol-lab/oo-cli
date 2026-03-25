import type { Logger } from "pino";
import type {
    Cache,
    CacheOptions,
    CacheSetOptions,
    CacheStore,
} from "../../application/contracts/cache.ts";

import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { constants, Database } from "bun:sqlite";
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
    id: string;
    logger?: Logger;
    maxEntries?: number;
    now: () => number;
}

export class SqliteCacheStore implements CacheStore {
    private database: Database | undefined;
    private readonly filePath: string;
    private readonly logger?: Logger;

    constructor(filePath: string, logger?: Logger) {
        this.filePath = filePath;
        this.logger = logger;
        this.database = openDatabase(filePath);
        this.logger?.debug(
            {
                ...withStorePath(this.filePath),
            },
            "Sqlite cache store opened.",
        );
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

        return new SqliteCache<Value>({
            database: this.getDatabase(),
            defaultTtlMs: options.defaultTtlMs,
            id: options.id,
            logger: this.logger,
            maxEntries: options.maxEntries,
            now: options.now ?? (() => Date.now()),
        });
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
        const row = this.selectFreshStatement.get({ key, now });

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
            const deleted = this.deleteStatement.run({ key }).changes > 0;

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

        this.touchStatement.run({ key, now });
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

        this.upsertStatement.run({
            key,
            value: serializeCacheValue(value),
            expiresAtMs,
            now,
        });
        this.deleteExpiredStatement.run({ now });

        this.options.logger?.debug(
            {
                ...withCacheId(this.options.id),
                expiresAtMs,
                ...withKeyFingerprint(createCacheKeyFingerprint(key)),
                ttlMs,
            },
            "Sqlite cache value stored.",
        );

        if (this.options.maxEntries !== undefined) {
            this.evictLeastRecentlyUsedStatement.run({
                maxEntries: this.options.maxEntries,
            });
        }
    }

    has(key: string): boolean {
        return this.get(key) !== null;
    }

    delete(key: string): boolean {
        const deleted = this.deleteStatement.run({ key }).changes > 0;

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
        this.clearStatement.run();
        this.options.logger?.info(
            {
                ...withCacheId(this.options.id),
            },
            "Sqlite cache namespace cleared.",
        );
    }
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
