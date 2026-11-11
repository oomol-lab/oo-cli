import { mkdir, stat } from "node:fs/promises";

import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import {
    createLogCapture,
    createTemporaryDirectory,
} from "../../../__tests__/helpers.ts";
import { APP_NAME } from "../../application/config/app-config.ts";
import { SharedSqliteDatabase } from "../store/sqlite-utils.ts";
import { resolveStorePaths } from "../store/store-path.ts";
import {
    resolveSqliteCacheTableName,
    SqliteCacheStore,
} from "./sqlite-cache.ts";

describe("SqliteCacheStore", () => {
    test("stores namespaces in the shared sqlite file and shares tables by id", async () => {
        const root = await createTemporaryDirectory("sqlite-cache");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const sharedDatabase = new SharedSqliteDatabase(storePaths.databaseFilePath);
        const cacheStore = new SqliteCacheStore(sharedDatabase);
        const primaryCache = cacheStore.getCache<string>({
            id: "search",
        });
        const sharedCache = cacheStore.getCache<string>({
            id: "search",
        });
        const isolatedCache = cacheStore.getCache<string>({
            id: "config",
        });

        try {
            await expect(stat(storePaths.databaseFilePath)).resolves.toMatchObject({
                isFile: expect.any(Function),
            });

            primaryCache.set("query:image", "first");

            expect(primaryCache.get("query:image")).toBe("first");
            expect(sharedCache.get("query:image")).toBe("first");
            expect(isolatedCache.get("query:image")).toBeNull();
        }
        finally {
            sharedDatabase.close();
        }
    });

    test("does not open the sqlite file until a cache namespace is requested", async () => {
        const root = await createTemporaryDirectory("sqlite-cache-lazy");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const sharedDatabase = new SharedSqliteDatabase(storePaths.databaseFilePath);
        const cacheStore = new SqliteCacheStore(sharedDatabase);

        await expect(stat(storePaths.databaseFilePath)).rejects.toMatchObject({
            code: "ENOENT",
        });

        try {
            cacheStore.getCache<string>({ id: "search" }).set("key", "value");

            expect(cacheStore.getCache<string>({ id: "search" }).get("key")).toBe("value");
        }
        finally {
            sharedDatabase.close();
        }
    });

    test("warns and evicts invalid cached values during deserialization", async () => {
        const root = await createTemporaryDirectory("sqlite-cache-invalid-json");
        const logCapture = createLogCapture();
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const sharedDatabase = new SharedSqliteDatabase(
            storePaths.databaseFilePath,
            logCapture.logger,
        );
        const cacheStore = new SqliteCacheStore(sharedDatabase, logCapture.logger);
        const cache = cacheStore.getCache<string>({
            id: "search",
        });
        const tableName = resolveSqliteCacheTableName("search");
        const database = new Database(storePaths.databaseFilePath, {
            strict: true,
        });

        try {
            cache.set("broken", "value");
            database.query(
                `UPDATE ${tableName} SET cache_value = $value WHERE cache_key = $key`,
            ).run({
                key: "broken",
                value: "not-json",
            });

            expect(cache.get("broken")).toBeNull();
            expect(cache.get("broken")).toBeNull();
            expect(
                database.query(
                    `SELECT COUNT(*) AS count FROM ${tableName} WHERE cache_key = $key`,
                ).get({
                    key: "broken",
                }) as {
                    count: number;
                },
            ).toEqual({ count: 0 });

            const logs = logCapture.read();

            expect(logs).toContain(`"level":"warn"`);
            expect(logs).toContain(`"category":"recoverable_cache"`);
            expect(logs).toContain(
                `"msg":"Sqlite cache entry was invalid and has been evicted."`,
            );
            expect(logs).toContain(`"cacheId":"search"`);
        }
        finally {
            database.close();
            sharedDatabase.close();
            logCapture.close();
        }
    });

    test("filters expired rows on reads and removes them on later writes", async () => {
        const root = await createTemporaryDirectory("sqlite-cache-expiry");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const sharedDatabase = new SharedSqliteDatabase(storePaths.databaseFilePath);
        const cacheStore = new SqliteCacheStore(sharedDatabase);
        let now = 1_000;
        const cache = cacheStore.getCache<string>({
            id: "search",
            now: () => now,
        });

        try {
            cache.set("stale", "old", { ttlMs: 5 });

            now = 1_010;

            expect(cache.get("stale")).toBeNull();

            cache.set("fresh", "new");
        }
        finally {
            sharedDatabase.close();
        }

        const tableName = resolveSqliteCacheTableName("search");
        const database = new Database(storePaths.databaseFilePath, {
            strict: true,
        });

        try {
            const rows = database.query(
                `SELECT cache_key AS cacheKey FROM ${tableName} ORDER BY cache_key ASC`,
            ).all() as Array<{
                cacheKey: string;
            }>;

            expect(rows).toEqual([
                { cacheKey: "fresh" },
            ]);
        }
        finally {
            database.close();
        }
    });

    test("evicts the least recently used entries when maxEntries is exceeded", async () => {
        const root = await createTemporaryDirectory("sqlite-cache-lru");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const sharedDatabase = new SharedSqliteDatabase(storePaths.databaseFilePath);
        const cacheStore = new SqliteCacheStore(sharedDatabase);
        let now = 1_000;
        const cache = cacheStore.getCache<string>({
            id: "search",
            maxEntries: 2,
            now: () => now,
        });

        try {
            cache.set("a", "alpha");
            now = 1_001;
            cache.set("b", "beta");
            now = 1_002;

            expect(cache.get("a")).toBe("alpha");

            now = 1_003;
            cache.set("c", "gamma");

            expect(cache.get("a")).toBe("alpha");
            expect(cache.get("b")).toBeNull();
            expect(cache.get("c")).toBe("gamma");
        }
        finally {
            sharedDatabase.close();
        }
    });

    test("falls back to a no-op cache when sqlite namespace initialization is locked", async () => {
        const root = await createTemporaryDirectory("sqlite-cache-locked-init");
        const logCapture = createLogCapture();
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        await mkdir(dirname(storePaths.databaseFilePath), { recursive: true });

        const lockDatabase = new Database(storePaths.databaseFilePath, {
            create: true,
            strict: true,
        });

        lockDatabase.run("PRAGMA journal_mode = WAL;");
        lockDatabase.run("BEGIN IMMEDIATE;");

        const sharedDatabase = new SharedSqliteDatabase(
            storePaths.databaseFilePath,
            logCapture.logger,
        );
        const cacheStore = new SqliteCacheStore(sharedDatabase, logCapture.logger);
        const cache = cacheStore.getCache<string>({
            id: "search",
        });

        try {
            cache.set("locked", "value");

            expect(cache.get("locked")).toBeNull();
            expect(cache.has("locked")).toBeFalse();
            expect(cache.delete("locked")).toBeFalse();

            cache.clear();

            const logs = logCapture.read();

            expect(logs).toContain(`"level":"warn"`);
            expect(logs).toContain(`"category":"recoverable_cache"`);
            expect(logs).toContain(
                `"msg":"Sqlite cache namespace is temporarily unavailable because the database is locked."`,
            );
        }
        finally {
            lockDatabase.run("ROLLBACK;");
            lockDatabase.close();
            sharedDatabase.close();
            logCapture.close();
        }
    });

    test("falls back to a no-op cache when the sqlite database file cannot be opened", async () => {
        const root = await createTemporaryDirectory("sqlite-cache-cantopen");
        const logCapture = createLogCapture();
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });

        await mkdir(storePaths.databaseFilePath, { recursive: true });

        const sharedDatabase = new SharedSqliteDatabase(
            storePaths.databaseFilePath,
            logCapture.logger,
        );
        const cacheStore = new SqliteCacheStore(sharedDatabase, logCapture.logger);
        const cache = cacheStore.getCache<string>({
            id: "search",
        });

        try {
            cache.set("blocked", "value");

            expect(cache.get("blocked")).toBeNull();
            expect(cache.has("blocked")).toBeFalse();
            expect(cache.delete("blocked")).toBeFalse();

            cache.clear();

            const logs = logCapture.read();

            expect(logs).toContain(`"level":"warn"`);
            expect(logs).toContain(`"category":"recoverable_cache"`);
            expect(logs).toContain(`"sqliteErrorCode":"SQLITE_CANTOPEN`);
            expect(logs).toContain(`"storePathKind":"directory"`);
            expect(logs).toContain(`"storePathExists":true`);
            expect(logs).toContain(`"parentDirectoryExists":true`);
            expect(logs).toContain(`"parentDirectoryWritable":true`);
            expect(logs).toContain(
                `"msg":"Sqlite cache namespace is temporarily unavailable because the database file cannot be opened."`,
            );
        }
        finally {
            sharedDatabase.close();
            logCapture.close();
        }
    });

    test("treats sqlite lock errors during cache operations as recoverable", async () => {
        const root = await createTemporaryDirectory("sqlite-cache-locked-ops");
        const logCapture = createLogCapture();
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const sharedDatabase = new SharedSqliteDatabase(
            storePaths.databaseFilePath,
            logCapture.logger,
        );
        const cacheStore = new SqliteCacheStore(sharedDatabase, logCapture.logger);
        const cache = cacheStore.getCache<string>({
            id: "search",
            maxEntries: 2,
        });

        await mkdir(dirname(storePaths.databaseFilePath), { recursive: true });

        const lockDatabase = new Database(storePaths.databaseFilePath, {
            strict: true,
        });
        let holdsWriteLock = false;

        try {
            cache.set("cached", "value");

            lockDatabase.run("PRAGMA journal_mode = WAL;");
            lockDatabase.run("BEGIN IMMEDIATE;");
            holdsWriteLock = true;

            expect(cache.get("cached")).toBe("value");
            expect(cache.delete("cached")).toBeFalse();

            cache.set("blocked", "value");
            cache.clear();

            lockDatabase.run("ROLLBACK;");
            holdsWriteLock = false;

            expect(cache.get("cached")).toBe("value");
            expect(cache.get("blocked")).toBeNull();

            const logs = logCapture.read();

            expect(logs).toContain(`"level":"warn"`);
            expect(logs).toContain(`"category":"recoverable_cache"`);
            expect(logs).not.toContain(`"storePathExists"`);
            expect(logs).toContain(
                `"msg":"Sqlite cache touch update was skipped because the database is locked."`,
            );
            expect(logs).toContain(
                `"msg":"Sqlite cache store was skipped because the database is locked."`,
            );
            expect(logs).toContain(
                `"msg":"Sqlite cache delete was skipped because the database is locked."`,
            );
            expect(logs).toContain(
                `"msg":"Sqlite cache clear was skipped because the database is locked."`,
            );
        }
        finally {
            if (holdsWriteLock) {
                lockDatabase.run("ROLLBACK;");
            }

            lockDatabase.close();
            sharedDatabase.close();
            logCapture.close();
        }
    });

    test("keeps its own lock budget after another store used a longer one", async () => {
        const root = await createTemporaryDirectory("sqlite-cache-lock-budget");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const sharedDatabase = new SharedSqliteDatabase(storePaths.databaseFilePath);
        const cache = new SqliteCacheStore(sharedDatabase).getCache<string>({
            id: "search",
        });
        const lockDatabase = new Database(storePaths.databaseFilePath, {
            strict: true,
        });
        const otherStoreBusyTimeoutMs = 30_000;
        let holdsWriteLock = false;

        try {
            // Another store sharing the connection waits far longer for locks.
            sharedDatabase.connect(otherStoreBusyTimeoutMs);
            lockDatabase.run("BEGIN IMMEDIATE;");
            holdsWriteLock = true;

            const startedAtMs = Date.now();

            cache.set("blocked", "value");

            expect(Date.now() - startedAtMs).toBeLessThan(otherStoreBusyTimeoutMs / 2);

            lockDatabase.run("ROLLBACK;");
            holdsWriteLock = false;

            expect(cache.get("blocked")).toBeNull();
        }
        finally {
            if (holdsWriteLock) {
                lockDatabase.run("ROLLBACK;");
            }

            lockDatabase.close();
            sharedDatabase.close();
        }
    });
});
