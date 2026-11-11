import { mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import {
    createLogCapture,
    createTemporaryDirectory,
    useTemporaryDirectoryCleanup,
} from "../../../__tests__/helpers.ts";
import { readTelemetryRowsForTest } from "../../application/telemetry/outbox.ts";
import { SqliteFileUploadStore } from "./sqlite-file-upload-store.ts";
import { isRecoverableSqliteError, SharedSqliteDatabase } from "./sqlite-utils.ts";

describe("isRecoverableSqliteError", () => {
    test("treats sqlite extended recoverable error codes as recoverable", () => {
        expect(isRecoverableSqliteError(createSqliteError("SQLITE_IOERR"))).toBeTrue();
        expect(isRecoverableSqliteError(createSqliteError("SQLITE_BUSY_SNAPSHOT"))).toBeTrue();
        expect(isRecoverableSqliteError(createSqliteError("SQLITE_CANTOPEN_ISDIR"))).toBeTrue();
        expect(isRecoverableSqliteError(createSqliteError("SQLITE_IOERR_ACCESS"))).toBeTrue();
        expect(isRecoverableSqliteError(createSqliteError("SQLITE_READONLY_DIRECTORY"))).toBeTrue();
    });

    test("rejects unrelated codes and values that are not errors", () => {
        expect(isRecoverableSqliteError(createSqliteError("SQLITE_MISUSE"))).toBeFalse();
        expect(isRecoverableSqliteError(new Error("no code"))).toBeFalse();
        expect(isRecoverableSqliteError("SQLITE_IOERR")).toBeFalse();
    });
});

describe("SharedSqliteDatabase", () => {
    const temporaryDirectories = useTemporaryDirectoryCleanup();

    test("creates the file on first use and configures it for concurrent processes", async () => {
        const filePath = await createDatabaseFilePath("sqlite-shared-open");
        const database = new SharedSqliteDatabase(filePath);

        expect(database.getFilePath()).toBe(filePath);
        expect(database.exists()).toBeFalse();
        await expect(stat(filePath)).rejects.toMatchObject({ code: "ENOENT" });

        try {
            const connection = database.connect(1_234);

            expect(database.exists()).toBeTrue();
            expect(connection.query("PRAGMA journal_mode;").get()).toEqual({
                journal_mode: "wal",
            });
            // 1 is NORMAL.
            expect(connection.query("PRAGMA synchronous;").get()).toEqual({
                synchronous: 1,
            });
            expect(connection.query("PRAGMA busy_timeout;").get()).toEqual({
                timeout: 1_234,
            });
        }
        finally {
            database.close();
        }
    });

    test("shares one connection and applies each caller's lock budget", async () => {
        const filePath = await createDatabaseFilePath("sqlite-shared-budget");
        const database = new SharedSqliteDatabase(filePath);

        try {
            const connection = database.connect(250);

            expect(database.connect(5_000)).toBe(connection);
            expect(connection.query("PRAGMA busy_timeout;").get()).toEqual({
                timeout: 5_000,
            });
            expect(database.connect(20)).toBe(connection);
            expect(connection.query("PRAGMA busy_timeout;").get()).toEqual({
                timeout: 20,
            });
        }
        finally {
            database.close();
        }
    });

    test("removes the wal sidecar files on close and reopens on demand", async () => {
        const filePath = await createDatabaseFilePath("sqlite-shared-close");
        const logCapture = createLogCapture();
        const database = new SharedSqliteDatabase(filePath, logCapture.logger);

        try {
            database.connect(250).run("CREATE TABLE entries (id INTEGER PRIMARY KEY);");

            await expect(stat(`${filePath}-wal`)).resolves.toBeDefined();
            await expect(stat(`${filePath}-shm`)).resolves.toBeDefined();

            database.close();
            // Closing an already closed database is a no-op.
            database.close();

            await expect(stat(`${filePath}-wal`)).rejects.toBeDefined();
            await expect(stat(`${filePath}-shm`)).rejects.toBeDefined();
            expect(logCapture.read()).toContain(`"msg":"Sqlite database closed."`);
            expect(database.exists()).toBeTrue();

            database.connect(250).run("INSERT INTO entries (id) VALUES (1);");

            expect(
                database.connect(250).query("SELECT COUNT(*) AS count FROM entries;").get(),
            ).toEqual({ count: 1 });
        }
        finally {
            database.close();
            logCapture.close();
        }
    });

    test("recreates a file that is not a sqlite database", async () => {
        const filePath = await createDatabaseFilePath("sqlite-shared-notadb");
        const logCapture = createLogCapture();
        const database = new SharedSqliteDatabase(filePath, logCapture.logger);

        await Bun.write(filePath, "not sqlite");

        try {
            database.connect(250).run("CREATE TABLE entries (id INTEGER PRIMARY KEY);");

            const logs = logCapture.read();

            expect(logs).toContain(`"level":"warn"`);
            expect(logs).toContain(`"sqliteErrorCode":"SQLITE_NOTADB"`);
            expect(logs).toContain(
                `"msg":"Sqlite database file was unusable and has been recreated."`,
            );
        }
        finally {
            database.close();
            logCapture.close();
        }
    });

    test("reports a path that cannot be opened without deleting anything", async () => {
        const filePath = await createDatabaseFilePath("sqlite-shared-cantopen");
        const database = new SharedSqliteDatabase(filePath);

        await mkdir(filePath, { recursive: true });

        expect(() => database.connect(250)).toThrow(
            expect.objectContaining({
                code: expect.stringContaining("SQLITE_CANTOPEN"),
            }),
        );
        expect(database.exists()).toBeFalse();
        await expect(stat(filePath)).resolves.toMatchObject({
            isDirectory: expect.any(Function),
        });
    });

    test("reports a busy database once the lock budget is spent and writes after the lock is released", async () => {
        const filePath = await createDatabaseFilePath("sqlite-shared-busy");
        const database = new SharedSqliteDatabase(filePath);

        database.connect(20).run("CREATE TABLE entries (id INTEGER PRIMARY KEY);");

        const otherWriter = new Database(filePath, { strict: true });

        try {
            otherWriter.run("BEGIN IMMEDIATE;");
            otherWriter.run("INSERT INTO entries (id) VALUES (1);");

            expect(() => database.connect(20).run("INSERT INTO entries (id) VALUES (2);"))
                .toThrow(expect.objectContaining({ code: "SQLITE_BUSY" }));
            // Readers are never blocked by the writer in WAL mode.
            expect(
                database.connect(20).query("SELECT COUNT(*) AS count FROM entries;").get(),
            ).toEqual({ count: 0 });

            otherWriter.run("COMMIT;");
            database.connect(20).run("INSERT INTO entries (id) VALUES (2);");

            expect(
                database.connect(20).query("SELECT COUNT(*) AS count FROM entries;").get(),
            ).toEqual({ count: 2 });
        }
        finally {
            otherWriter.close();
            database.close();
        }
    });

    test("closes without escalating a recoverable checkpoint failure", async () => {
        const filePath = await createDatabaseFilePath("sqlite-shared-checkpoint");
        const logCapture = createLogCapture();
        const database = new SharedSqliteDatabase(filePath, logCapture.logger);

        try {
            failCheckpoint(database, createSqliteError("SQLITE_IOERR_FSYNC"));

            expect(() => database.close()).not.toThrow();

            const logs = logCapture.read();

            expect(logs).toContain(`"msg":"Sqlite checkpoint skipped after a recoverable failure."`);
            expect(logs).toContain(`"sqliteErrorCode":"SQLITE_IOERR_FSYNC"`);
            expect(logs).toContain(`"msg":"Sqlite database closed."`);
        }
        finally {
            logCapture.close();
        }
    });

    test("rethrows a non-recoverable checkpoint failure after closing the connection", async () => {
        const filePath = await createDatabaseFilePath("sqlite-shared-checkpoint-fatal");
        const logCapture = createLogCapture();
        const database = new SharedSqliteDatabase(filePath, logCapture.logger);

        try {
            const connection = failCheckpoint(database, createSqliteError("SQLITE_MISUSE"));

            expect(() => database.close()).toThrow("sqlite failure");
            // The connection was released all the same.
            expect(() => connection.query("SELECT 1;").get()).toThrow();
            expect(logCapture.read()).not.toContain("Sqlite checkpoint skipped");
        }
        finally {
            logCapture.close();
        }
    });

    test("waits for a process that is still initializing a new database file", async () => {
        const filePath = await createDatabaseFilePath("sqlite-shared-new-file");
        const holdMs = 300;

        await mkdir(dirname(filePath), { recursive: true });

        const holder = Bun.spawn({
            cmd: [
                process.execPath,
                join(import.meta.dir, "__tests__", "new-database-lock-holder.ts"),
                filePath,
                String(holdMs),
            ],
            stderr: "pipe",
            stdout: "pipe",
        });
        const database = new SharedSqliteDatabase(filePath);

        try {
            // Resolves once the holder has taken the write lock.
            const { value } = await holder.stdout.getReader().read();

            expect(new TextDecoder().decode(value)).toBe("locked\n");

            const startedAtMs = Date.now();
            const connection = database.connect(30_000);

            // The switch to WAL only succeeded after the holder committed.
            expect(Date.now() - startedAtMs).toBeGreaterThanOrEqual(holdMs / 2);
            expect(connection.query("PRAGMA journal_mode;").get()).toEqual({
                journal_mode: "wal",
            });
            expect(
                connection.query("SELECT COUNT(*) AS count FROM held;").get(),
            ).toEqual({ count: 0 });
        }
        finally {
            database.close();
        }

        expect({
            exitCode: await holder.exited,
            stderr: await new Response(holder.stderr).text(),
        }).toEqual({ exitCode: 0, stderr: "" });
    }, 60_000);

    test("gives up on a new database file that stays locked past the lock budget", async () => {
        const filePath = await createDatabaseFilePath("sqlite-shared-new-file-busy");

        await mkdir(dirname(filePath), { recursive: true });

        const otherWriter = new Database(filePath, { create: true, strict: true });
        const database = new SharedSqliteDatabase(filePath);

        try {
            otherWriter.run("BEGIN IMMEDIATE;");

            const startedAtMs = Date.now();

            expect(() => database.connect(100)).toThrow(
                expect.objectContaining({ code: "SQLITE_BUSY" }),
            );
            expect(Date.now() - startedAtMs).toBeGreaterThanOrEqual(100);
            expect(database.exists()).toBeTrue();
        }
        finally {
            otherWriter.run("ROLLBACK;");
            otherWriter.close();
            database.close();
        }
    });

    test("loses no writes when several processes create and write the database at once", async () => {
        const filePath = await createDatabaseFilePath("sqlite-shared-processes");
        const writerCount = 6;
        const recordCount = 25;
        const startAtMs = Date.now() + 1_500;
        const writers = Array.from({ length: writerCount }, (_, writerIndex) => Bun.spawn({
            cmd: [
                process.execPath,
                join(import.meta.dir, "__tests__", "concurrent-writer.ts"),
                filePath,
                String(writerIndex),
                String(recordCount),
                String(startAtMs),
            ],
            stderr: "pipe",
            stdout: "ignore",
        }));
        const results = await Promise.all(writers.map(async writer => ({
            exitCode: await writer.exited,
            stderr: await new Response(writer.stderr).text(),
        })));

        // Listing the failures keeps a writer's stderr in the assertion output.
        expect(results.filter(result => result.exitCode !== 0)).toEqual([]);

        const database = new SharedSqliteDatabase(filePath);

        try {
            // Upload records wait for the write lock, so none may be missing.
            expect(
                new SqliteFileUploadStore(database).list({ now: 0 }),
            ).toHaveLength(writerCount * recordCount);
            expect(
                database.connect(250).query("PRAGMA integrity_check;").get(),
            ).toEqual({ integrity_check: "ok" });
        }
        finally {
            database.close();
        }

        // Telemetry is best effort under contention, but it shares the file.
        expect(readTelemetryRowsForTest(filePath).length).toBeGreaterThan(0);
    }, 120_000);

    async function createDatabaseFilePath(prefix: string): Promise<string> {
        const root = await createTemporaryDirectory(prefix);

        temporaryDirectories.track(root);

        return join(root, "data", "oo.sqlite");
    }
});

function createSqliteError(code: string): Error {
    return Object.assign(new Error("sqlite failure"), { code });
}

// Makes the checkpoint that `close()` runs fail with `error`, and returns the
// open connection so the caller can check that it was still released.
function failCheckpoint(database: SharedSqliteDatabase, error: Error): Database {
    const connection = database.connect(250);
    const run = connection.run.bind(connection);

    connection.run = (sql: string, ...bindings: never[]) => {
        if (sql.includes("wal_checkpoint")) {
            throw error;
        }

        return run(sql, ...bindings);
    };

    return connection;
}
