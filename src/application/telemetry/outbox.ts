import type { Database } from "bun:sqlite";

import type { TelemetryBatchItem } from "./payload.ts";
import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SharedSqliteDatabase } from "../../adapters/store/sqlite-utils.ts";
import {
    telemetryDeviceIdFileName,
    telemetryLeaseMaxEvents,
    telemetryLeaseTtlMs,
    telemetryMaxAttempts,
    telemetryMaxEventAgeMs,
    telemetryOutboxMaxEvents,
    telemetrySqliteBusyTimeoutMs,
} from "./constants.ts";
import {
    parseTelemetryBatchItemJson,
    serializeTelemetryBatchItem,
} from "./payload.ts";
import { isUuidV7 } from "./uuid.ts";

export interface TelemetryDeviceIdResult {
    deviceId: string;
    isFirstRun: boolean;
}

export interface TelemetryEventRow {
    attempts: number;
    availableAtMs: number;
    createdAtMs: number;
    id: string;
    leaseUntilMs: number | null;
    payloadBytes: number;
    payloadJson: string;
}

export interface TelemetryOutboxSummary {
    lastFlushAtMs?: number;
    pendingCount: number;
}

const telemetryEventsTableName = "telemetry_events";
const telemetryStateTableName = "telemetry_state";

export function resolveTelemetryDeviceIdFilePath(directoryPath: string): string {
    return join(directoryPath, telemetryDeviceIdFileName);
}

export async function readTelemetryDeviceIdIfExists(
    directoryPath: string,
): Promise<string | undefined> {
    try {
        const content = await readFile(
            resolveTelemetryDeviceIdFilePath(directoryPath),
            "utf8",
        );
        const deviceId = content.trim();

        return isUuidV7(deviceId) ? deviceId : undefined;
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }
}

export async function readOrCreateTelemetryDeviceId(
    directoryPath: string,
): Promise<TelemetryDeviceIdResult> {
    const existingDeviceId = await readTelemetryDeviceIdIfExists(directoryPath);

    if (existingDeviceId !== undefined) {
        return {
            deviceId: existingDeviceId,
            isFirstRun: false,
        };
    }

    const deviceId = Bun.randomUUIDv7();

    await mkdir(directoryPath, { recursive: true });
    await writeFile(
        resolveTelemetryDeviceIdFilePath(directoryPath),
        `${deviceId}\n`,
        {
            encoding: "utf8",
            flag: "wx",
        },
    ).catch(async (error) => {
        if (!isNodeAlreadyExistsError(error)) {
            throw error;
        }

        const racedDeviceId = await readTelemetryDeviceIdIfExists(directoryPath);

        if (racedDeviceId !== undefined) {
            return;
        }

        await writeFile(
            resolveTelemetryDeviceIdFilePath(directoryPath),
            `${deviceId}\n`,
            "utf8",
        );
    });

    const persistedDeviceId = await readTelemetryDeviceIdIfExists(directoryPath);

    return persistedDeviceId === undefined
        ? {
                deviceId,
                isFirstRun: true,
            }
        : {
                deviceId: persistedDeviceId,
                isFirstRun: persistedDeviceId === deviceId,
            };
}

export function enqueueTelemetryBatchItem(options: {
    // Runs in the enqueue's transaction once the event was either inserted or
    // rejected because the outbox is full.
    afterAttempt?: (connection: Database) => void;
    database: SharedSqliteDatabase;
    item: TelemetryBatchItem;
    nowMs: number;
}): boolean {
    const payloadJson = serializeTelemetryBatchItem(options.item);

    if (payloadJson === undefined) {
        return false;
    }

    const connection = openTelemetryDatabase(options.database);

    return connection.transaction(() => {
        if (countTelemetryEvents(connection) >= telemetryOutboxMaxEvents) {
            // A full outbox is the one that most needs a flusher, so the
            // rejected event still gets to request one.
            options.afterAttempt?.(connection);

            return false;
        }

        connection.query(
            [
                `INSERT INTO ${telemetryEventsTableName} (`,
                "id,",
                "created_at_ms,",
                "available_at_ms,",
                "payload_json,",
                "payload_bytes",
                ") VALUES (",
                "$id,",
                "$createdAtMs,",
                "$availableAtMs,",
                "$payloadJson,",
                "$payloadBytes",
                ")",
            ].join(" "),
        ).run({
            availableAtMs: options.nowMs,
            createdAtMs: options.nowMs,
            id: options.item.uuid,
            payloadBytes: Buffer.byteLength(payloadJson, "utf8"),
            payloadJson,
        });
        options.afterAttempt?.(connection);

        return true;
    }).immediate();
}

export function readTelemetryOutboxSummary(
    database: SharedSqliteDatabase,
): TelemetryOutboxSummary {
    if (!database.exists()) {
        return { pendingCount: 0 };
    }

    const connection = openTelemetryDatabase(database);

    return {
        lastFlushAtMs: readTelemetryStateNumber(connection, "last_flush_at_ms"),
        pendingCount: countTelemetryEvents(connection),
    };
}

export function purgeTelemetryOutboxIfExists(
    database: SharedSqliteDatabase,
): void {
    if (!database.exists()) {
        return;
    }

    openTelemetryDatabase(database).run(`DELETE FROM ${telemetryEventsTableName}`);
}

export function readTelemetryStateNumber(
    database: Database,
    key: string,
): number | undefined {
    const row = database.query<{ value: string }, { key: string }>(
        `SELECT value FROM ${telemetryStateTableName} WHERE key = $key LIMIT 1`,
    ).get({ key });

    if (row === null) {
        return undefined;
    }

    const parsed = Number(row.value);

    return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function writeTelemetryStateNumber(
    database: Database,
    key: string,
    value: number,
): void {
    database.query(
        [
            `INSERT INTO ${telemetryStateTableName} (key, value)`,
            "VALUES ($key, $value)",
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        ].join(" "),
    ).run({
        key,
        value: String(value),
    });
}

// Returns the shared connection with the telemetry tables in place. The
// connection belongs to `database`; callers must not close it.
export function openTelemetryDatabase(
    database: SharedSqliteDatabase,
    busyTimeoutMs: number = telemetrySqliteBusyTimeoutMs,
): Database {
    const connection = database.connect(busyTimeoutMs);

    initializeTelemetryDatabase(connection);

    return connection;
}

export function deleteExpiredTelemetryEvents(
    database: Database,
    nowMs: number,
): void {
    database.query(
        [
            `DELETE FROM ${telemetryEventsTableName}`,
            "WHERE attempts >= $maxAttempts",
            "OR created_at_ms <= $oldestAllowedMs",
        ].join(" "),
    ).run({
        maxAttempts: telemetryMaxAttempts,
        oldestAllowedMs: nowMs - telemetryMaxEventAgeMs,
    });
}

export function leaseReadyTelemetryRows(
    database: Database,
    nowMs: number,
): TelemetryEventRow[] {
    const leaseUntilMs = nowMs + telemetryLeaseTtlMs;

    // IMMEDIATE, so two flushers can never lease the same rows.
    return database.transaction(() => {
        const rows = database.query<TelemetryEventRow, {
            limit: number;
            nowMs: number;
        }>(
            [
                "SELECT",
                "id AS id,",
                "created_at_ms AS createdAtMs,",
                "available_at_ms AS availableAtMs,",
                "lease_until_ms AS leaseUntilMs,",
                "attempts AS attempts,",
                "payload_json AS payloadJson,",
                "payload_bytes AS payloadBytes",
                `FROM ${telemetryEventsTableName}`,
                "WHERE available_at_ms <= $nowMs",
                "AND (lease_until_ms IS NULL OR lease_until_ms <= $nowMs)",
                "ORDER BY created_at_ms ASC",
                "LIMIT $limit",
            ].join(" "),
        ).all({
            limit: telemetryLeaseMaxEvents,
            nowMs,
        });
        const leaseStatement = database.query(
            [
                `UPDATE ${telemetryEventsTableName}`,
                "SET lease_until_ms = $leaseUntilMs",
                "WHERE id = $id",
            ].join(" "),
        );

        for (const row of rows) {
            leaseStatement.run({
                id: row.id,
                leaseUntilMs,
            });
        }

        return rows.map(row => ({
            ...row,
            leaseUntilMs,
        }));
    }).immediate();
}

export function deleteTelemetryRows(
    database: Database,
    rows: readonly Pick<TelemetryEventRow, "id">[],
): void {
    if (rows.length === 0) {
        return;
    }

    const statement = database.query(
        `DELETE FROM ${telemetryEventsTableName} WHERE id = $id`,
    );

    database.transaction(() => {
        for (const row of rows) {
            statement.run({ id: row.id });
        }
    }).immediate();
}

export function recordTelemetryRowsAttempted(
    database: Database,
    rows: readonly Pick<TelemetryEventRow, "id">[],
    options: {
        availableAtMs: number;
        maxAttempts: number;
    },
): void {
    const statement = database.query(
        [
            `UPDATE ${telemetryEventsTableName}`,
            "SET attempts = attempts + 1,",
            "available_at_ms = $availableAtMs,",
            "lease_until_ms = NULL",
            "WHERE id = $id",
        ].join(" "),
    );

    database.transaction(() => {
        for (const row of rows) {
            statement.run({
                availableAtMs: options.availableAtMs,
                id: row.id,
            });
        }

        database.query(
            [
                `DELETE FROM ${telemetryEventsTableName}`,
                "WHERE attempts >= $maxAttempts",
            ].join(" "),
        ).run({ maxAttempts: options.maxAttempts });
    }).immediate();
}

export function releaseTelemetryRowsWithoutAttempt(
    database: Database,
    rows: readonly Pick<TelemetryEventRow, "id">[],
    availableAtMs: number,
): void {
    if (rows.length === 0) {
        return;
    }

    const statement = database.query(
        [
            `UPDATE ${telemetryEventsTableName}`,
            "SET available_at_ms = $availableAtMs,",
            "lease_until_ms = NULL",
            "WHERE id = $id",
        ].join(" "),
    );

    database.transaction(() => {
        for (const row of rows) {
            statement.run({
                availableAtMs,
                id: row.id,
            });
        }
    }).immediate();
}

/**
 * Test-only accessor that reads persisted telemetry rows so tests can assert on
 * the live telemetry write path. Not invoked by production code.
 *
 * @public
 */
export function readTelemetryRowsForTest(
    databaseFilePath: string,
): TelemetryEventRow[] {
    const database = new SharedSqliteDatabase(databaseFilePath);

    if (!database.exists()) {
        return [];
    }

    try {
        return openTelemetryDatabase(database).query<TelemetryEventRow, null>(
            [
                "SELECT",
                "id AS id,",
                "created_at_ms AS createdAtMs,",
                "available_at_ms AS availableAtMs,",
                "lease_until_ms AS leaseUntilMs,",
                "attempts AS attempts,",
                "payload_json AS payloadJson,",
                "payload_bytes AS payloadBytes",
                `FROM ${telemetryEventsTableName}`,
                "ORDER BY created_at_ms ASC",
            ].join(" "),
        ).all(null);
    }
    finally {
        database.close();
    }
}

export function parseTelemetryRowPayload(
    row: Pick<TelemetryEventRow, "payloadJson">,
): TelemetryBatchItem | undefined {
    return parseTelemetryBatchItemJson(row.payloadJson);
}

export function countTelemetryEvents(database: Database): number {
    const row = database.query<{ count: number }, null>(
        `SELECT COUNT(*) AS count FROM ${telemetryEventsTableName}`,
    ).get(null);

    return row?.count ?? 0;
}

function initializeTelemetryDatabase(database: Database): void {
    database.run(
        [
            `CREATE TABLE IF NOT EXISTS ${telemetryEventsTableName} (`,
            "id TEXT PRIMARY KEY,",
            "created_at_ms INTEGER NOT NULL,",
            "available_at_ms INTEGER NOT NULL,",
            "lease_until_ms INTEGER,",
            "attempts INTEGER NOT NULL DEFAULT 0,",
            "payload_json TEXT NOT NULL,",
            "payload_bytes INTEGER NOT NULL",
            ")",
        ].join(" "),
    );
    database.run(
        [
            `CREATE INDEX IF NOT EXISTS ${telemetryEventsTableName}_ready_idx`,
            `ON ${telemetryEventsTableName}(available_at_ms, created_at_ms)`,
        ].join(" "),
    );
    database.run(
        [
            `CREATE TABLE IF NOT EXISTS ${telemetryStateTableName} (`,
            "key TEXT PRIMARY KEY,",
            "value TEXT NOT NULL",
            ")",
        ].join(" "),
    );
}

function isNodeNotFoundError(error: unknown): boolean {
    return isNodeErrorWithCode(error, "ENOENT");
}

function isNodeAlreadyExistsError(error: unknown): boolean {
    return isNodeErrorWithCode(error, "EEXIST");
}

function isNodeErrorWithCode(error: unknown, code: string): boolean {
    return error !== null
        && typeof error === "object"
        && "code" in error
        && error.code === code;
}
