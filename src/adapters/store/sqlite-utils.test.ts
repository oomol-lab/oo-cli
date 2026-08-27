import type { Database } from "bun:sqlite";
import { constants } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { createLogCapture } from "../../../__tests__/helpers.ts";
import { closeSqliteDatabase, isRecoverableSqliteError } from "./sqlite-utils.ts";

const storeFilePath = "/tmp/oo-sqlite-utils/store.sqlite";

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

describe("closeSqliteDatabase", () => {
    test("closes without escalating an extended recoverable checkpoint failure", () => {
        const stub = createStubDatabase(createSqliteError("SQLITE_IOERR_FSYNC"));
        const logCapture = createLogCapture();

        expect(() => closeSqliteDatabase(stub.database, {
            checkpointMode: "PASSIVE",
            closedLogMessage: "Sqlite file upload store closed.",
            filePath: storeFilePath,
            logger: logCapture.logger,
        })).not.toThrow();

        expect(stub.closed).toBeTrue();

        const logs = logCapture.read();

        expect(logs).toContain("\"msg\":\"Sqlite checkpoint skipped after a recoverable failure.\"");
        expect(logs).toContain("\"sqliteErrorCode\":\"SQLITE_IOERR_FSYNC\"");
        expect(logs).toContain("\"msg\":\"Sqlite file upload store closed.\"");
    });

    test("rethrows a non-recoverable checkpoint failure after closing the database", () => {
        const stub = createStubDatabase(createSqliteError("SQLITE_MISUSE"));
        const logCapture = createLogCapture();

        expect(() => closeSqliteDatabase(stub.database, {
            checkpointMode: "PASSIVE",
            closedLogMessage: "Sqlite file upload store closed.",
            filePath: storeFilePath,
            logger: logCapture.logger,
        })).toThrow("sqlite failure");

        expect(stub.closed).toBeTrue();
        expect(logCapture.read()).not.toContain("Sqlite checkpoint skipped");
    });

    test("runs the requested wal checkpoint mode", () => {
        const truncateStub = createStubDatabase();

        closeSqliteDatabase(truncateStub.database, {
            checkpointMode: "TRUNCATE",
            closedLogMessage: "Sqlite cache store closed.",
            filePath: storeFilePath,
        });

        expect(truncateStub.statements).toEqual(["PRAGMA wal_checkpoint(TRUNCATE);"]);
        expect(truncateStub.fileControlCalls).toEqual([
            [constants.SQLITE_FCNTL_PERSIST_WAL, 0],
        ]);

        const passiveStub = createStubDatabase();

        closeSqliteDatabase(passiveStub.database, {
            checkpointMode: "PASSIVE",
            closedLogMessage: "Sqlite file upload store closed.",
            filePath: storeFilePath,
        });

        expect(passiveStub.statements).toEqual(["PRAGMA wal_checkpoint(PASSIVE);"]);
        expect(passiveStub.fileControlCalls).toEqual([
            [constants.SQLITE_FCNTL_PERSIST_WAL, 0],
        ]);
    });
});

function createSqliteError(code: string): Error {
    return Object.assign(new Error("sqlite failure"), { code });
}

interface StubDatabase {
    closed: boolean;
    database: Database;
    fileControlCalls: number[][];
    statements: string[];
}

function createStubDatabase(checkpointError?: Error): StubDatabase {
    const stub: StubDatabase = {
        closed: false,
        database: undefined as unknown as Database,
        fileControlCalls: [],
        statements: [],
    };

    stub.database = {
        close() {
            stub.closed = true;
        },
        fileControl(operation: number, value: number) {
            stub.fileControlCalls.push([operation, value]);
        },
        run(sql: string) {
            if (checkpointError !== undefined) {
                throw checkpointError;
            }

            stub.statements.push(sql);
        },
    } as unknown as Database;

    return stub;
}
