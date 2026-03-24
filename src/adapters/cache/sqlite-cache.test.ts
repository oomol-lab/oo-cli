import { stat } from "node:fs/promises";

import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../__tests__/helpers.ts";
import { APP_NAME } from "../../application/config/app-config.ts";
import { resolveStorePaths } from "../store/store-path.ts";
import {
    resolveSqliteCacheTableName,
    SqliteCacheStore,
} from "./sqlite-cache.ts";

describe("SqliteCacheStore", () => {
    test("creates the sqlite file in the data directory and shares tables by id", async () => {
        const root = await createTemporaryDirectory("sqlite-cache");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const cacheStore = new SqliteCacheStore(storePaths.cacheFilePath);
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
            await expect(stat(cacheStore.getFilePath())).resolves.toMatchObject({
                isFile: expect.any(Function),
            });

            primaryCache.set("query:image", "first");

            expect(primaryCache.get("query:image")).toBe("first");
            expect(sharedCache.get("query:image")).toBe("first");
            expect(isolatedCache.get("query:image")).toBeNull();
            expect(cacheStore.getFilePath()).toBe(storePaths.cacheFilePath);
        }
        finally {
            cacheStore.close();
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
        const cacheStore = new SqliteCacheStore(storePaths.cacheFilePath);
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
            cacheStore.close();
        }

        const tableName = resolveSqliteCacheTableName("search");
        const database = new Database(cacheStore.getFilePath(), {
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
        const cacheStore = new SqliteCacheStore(storePaths.cacheFilePath);
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
            cacheStore.close();
        }
    });

    test("truncates wal sidecar files on close", async () => {
        const root = await createTemporaryDirectory("sqlite-cache-close");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const cacheStore = new SqliteCacheStore(storePaths.cacheFilePath);
        const cache = cacheStore.getCache<string>({
            id: "search",
        });
        const walFilePath = `${cacheStore.getFilePath()}-wal`;
        const shmFilePath = `${cacheStore.getFilePath()}-shm`;

        cache.set("query:image", "cached");

        await expect(stat(walFilePath)).resolves.toMatchObject({
            isFile: expect.any(Function),
        });
        await expect(stat(shmFilePath)).resolves.toMatchObject({
            isFile: expect.any(Function),
        });

        cacheStore.close();

        await expect(stat(walFilePath)).rejects.toBeDefined();
        await expect(stat(shmFilePath)).rejects.toBeDefined();
    });
});
