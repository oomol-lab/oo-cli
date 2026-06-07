import type { Database } from "bun:sqlite";
import type { Logger } from "pino";

import type { TelemetryBatchItem } from "./payload.ts";
import { Buffer } from "node:buffer";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { openSqliteDatabase } from "../../adapters/store/sqlite-utils.ts";
import { logCategory } from "../logging/log-categories.ts";
import { withCategory, withStorePath } from "../logging/log-fields.ts";
import {
    telemetryDatabaseFileName,
    telemetryDatabaseMaxBytes,
    telemetryDeviceIdFileName,
    telemetryLeaseMaxEvents,
    telemetryLeaseTtlMs,
    telemetryMaxAttempts,
    telemetryMaxEventAgeMs,
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

export function resolveTelemetryDatabaseFilePath(directoryPath: string): string {
    return join(directoryPath, telemetryDatabaseFileName);
}

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
    directoryPath: string;
    item: TelemetryBatchItem;
    logger?: Logger;
    nowMs: number;
}): boolean {
    const payloadJson = serializeTelemetryBatchItem(options.item);

    if (payloadJson === undefined || isTelemetryDatabaseOverHardLimit(options.directoryPath)) {
        return false;
    }

    const database = openTelemetryDatabase(options.directoryPath, options.logger);

    try {
        database.query(
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

        return true;
    }
    finally {
        database.close();
    }
}

export function readTelemetryOutboxSummary(
    directoryPath: string,
    logger?: Logger,
): TelemetryOutboxSummary {
    if (!telemetryDatabaseFileExists(directoryPath)) {
        return { pendingCount: 0 };
    }

    const database = openTelemetryDatabase(directoryPath, logger);

    try {
        return {
            lastFlushAtMs: readTelemetryStateNumber(database, "last_flush_at_ms"),
            pendingCount: countTelemetryEvents(database),
        };
    }
    finally {
        database.close();
    }
}

export function purgeTelemetryOutboxIfExists(
    directoryPath: string,
    logger?: Logger,
): void {
    if (!telemetryDatabaseFileExists(directoryPath)) {
        return;
    }

    const database = openTelemetryDatabase(directoryPath, logger);

    try {
        database.run(`DELETE FROM ${telemetryEventsTableName}`);
    }
    finally {
        database.close();
    }
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

export function openTelemetryDatabase(
    directoryPath: string,
    logger?: Logger,
): Database {
    const filePath = resolveTelemetryDatabaseFilePath(directoryPath);

    try {
        return openInitializedTelemetryDatabase(filePath);
    }
    catch (error) {
        if (!isRecoverableTelemetrySqliteError(error)) {
            throw error;
        }

        logger?.warn(
            {
                ...withCategory(logCategory.systemError),
                err: error,
                ...withStorePath(filePath),
            },
            "Telemetry sqlite database was reset after a recoverable open failure.",
        );
        resetTelemetryDatabaseFiles(filePath);

        return openInitializedTelemetryDatabase(filePath);
    }
}

export function reclaimExpiredTelemetryLeases(
    database: Database,
    nowMs: number,
): void {
    database.query(
        [
            `UPDATE ${telemetryEventsTableName}`,
            "SET lease_until_ms = NULL",
            "WHERE lease_until_ms IS NOT NULL",
            "AND lease_until_ms <= $nowMs",
        ].join(" "),
    ).run({ nowMs });
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
    const leasedRows: TelemetryEventRow[] = [];

    database.run("BEGIN IMMEDIATE");
    let committed = false;

    try {
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
                "AND (lease_until_ms IS NULL OR lease_until_ms <= $nowMs)",
            ].join(" "),
        );

        for (const row of rows) {
            const result = leaseStatement.run({
                id: row.id,
                leaseUntilMs,
                nowMs,
            });

            if (result.changes > 0) {
                leasedRows.push({
                    ...row,
                    leaseUntilMs,
                });
            }
        }

        database.run("COMMIT");
        committed = true;
    }
    finally {
        if (!committed) {
            database.run("ROLLBACK");
        }
    }

    return leasedRows;
}

export function deleteTelemetryRows(
    database: Database,
    rows: readonly Pick<TelemetryEventRow, "id">[],
): void {
    const statement = database.query(
        `DELETE FROM ${telemetryEventsTableName} WHERE id = $id`,
    );

    for (const row of rows) {
        statement.run({ id: row.id });
    }
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
}

export function releaseTelemetryRowsWithoutAttempt(
    database: Database,
    rows: readonly Pick<TelemetryEventRow, "id">[],
    availableAtMs: number,
): void {
    const statement = database.query(
        [
            `UPDATE ${telemetryEventsTableName}`,
            "SET available_at_ms = $availableAtMs,",
            "lease_until_ms = NULL",
            "WHERE id = $id",
        ].join(" "),
    );

    for (const row of rows) {
        statement.run({
            availableAtMs,
            id: row.id,
        });
    }
}

/**
 * Test-only accessor that reads persisted telemetry rows so tests can assert on
 * the live telemetry write path. Not invoked by production code.
 *
 * @public
 */
export function readTelemetryRowsForTest(
    directoryPath: string,
): TelemetryEventRow[] {
    if (!telemetryDatabaseFileExists(directoryPath)) {
        return [];
    }

    const database = openTelemetryDatabase(directoryPath);

    try {
        return database.query<TelemetryEventRow, null>(
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
            `CREATE INDEX IF NOT EXISTS ${telemetryEventsTableName}_lease_idx`,
            `ON ${telemetryEventsTableName}(lease_until_ms)`,
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

function openInitializedTelemetryDatabase(filePath: string): Database {
    const database = openSqliteDatabase(filePath, {
        busyTimeoutMs: telemetrySqliteBusyTimeoutMs,
    });
    let initialized = false;

    try {
        initializeTelemetryDatabase(database);
        initialized = true;

        return database;
    }
    finally {
        if (!initialized) {
            database.close();
        }
    }
}

function isTelemetryDatabaseOverHardLimit(directoryPath: string): boolean {
    return readTelemetryDatabaseFileSetBytes(
        resolveTelemetryDatabaseFilePath(directoryPath),
    ) >= telemetryDatabaseMaxBytes;
}

function readTelemetryDatabaseFileSetBytes(filePath: string): number {
    let totalBytes = 0;

    for (const suffix of ["", "-wal", "-shm"]) {
        try {
            const stats = statSync(`${filePath}${suffix}`);

            if (stats.isFile()) {
                totalBytes += stats.size;
            }
        }
        catch (error) {
            if (isNodeNotFoundError(error)) {
                continue;
            }

            throw error;
        }
    }

    return totalBytes;
}

function telemetryDatabaseFileExists(directoryPath: string): boolean {
    try {
        return statSync(resolveTelemetryDatabaseFilePath(directoryPath)).isFile();
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
}

function resetTelemetryDatabaseFiles(filePath: string): void {
    mkdirSync(dirname(filePath), { recursive: true });

    for (const suffix of ["", "-shm", "-wal"]) {
        rmSync(`${filePath}${suffix}`, {
            force: true,
        });
    }
}

function isRecoverableTelemetrySqliteError(error: unknown): boolean {
    if (error === null || typeof error !== "object" || !("code" in error)) {
        return false;
    }

    return [
        "SQLITE_CANTOPEN",
        "SQLITE_CORRUPT",
        "SQLITE_IOERR",
        "SQLITE_NOTADB",
    ].includes(String(error.code));
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
