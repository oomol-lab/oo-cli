import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import {
    createTemporaryDirectory,
    useTemporaryDirectoryCleanup,
    withSharedSqliteDatabase,
} from "../../../__tests__/helpers.ts";
import {
    createTelemetryItemForTest,
    enqueueTelemetryItemForTest,
} from "./__tests__/helpers.ts";
import { telemetryOutboxMaxEvents } from "./constants.ts";
import {
    enqueueTelemetryBatchItem,
    openTelemetryDatabase,
    purgeTelemetryOutboxIfExists,
    readOrCreateTelemetryDeviceId,
    readTelemetryDeviceIdIfExists,
    readTelemetryOutboxSummary,
    readTelemetryRowsForTest,
    resolveTelemetryDeviceIdFilePath,
} from "./outbox.ts";
import { isUuidV7 } from "./uuid.ts";

describe("telemetry outbox", () => {
    const temporaryDirectories = useTemporaryDirectoryCleanup();

    test("enqueues into a recreated database when the file is not sqlite", async () => {
        const root = await createTemporaryDirectory("telemetry-outbox-corrupt");
        temporaryDirectories.track(root);
        const databaseFilePath = join(root, "oo.sqlite");

        await Bun.write(databaseFilePath, "not sqlite");

        const inserted = await enqueueTelemetryItemForTest(
            databaseFilePath,
            createTelemetryItemForTest(1),
            1000,
        );

        expect(inserted).toBe(true);
        expect(readTelemetryRowsForTest(databaseFilePath)).toHaveLength(1);
    });

    test("drops new rows once the outbox holds the maximum number of pending events", async () => {
        const root = await createTemporaryDirectory("telemetry-outbox-hard-limit");
        temporaryDirectories.track(root);
        const databaseFilePath = join(root, "oo.sqlite");

        await withSharedSqliteDatabase(databaseFilePath, (database) => {
            const connection = openTelemetryDatabase(database);
            const insert = connection.query(
                [
                    "INSERT INTO telemetry_events",
                    "(id, created_at_ms, available_at_ms, payload_json, payload_bytes)",
                    "VALUES ($id, 1000, 1000, '{}', 2)",
                ].join(" "),
            );

            connection.transaction(() => {
                for (let index = 0; index < telemetryOutboxMaxEvents - 1; index += 1) {
                    insert.run({ id: `pending-${index}` });
                }
            }).immediate();
        });

        const lastAccepted = await enqueueTelemetryItemForTest(
            databaseFilePath,
            createTelemetryItemForTest(1),
            1000,
        );
        const dropped = await enqueueTelemetryItemForTest(
            databaseFilePath,
            createTelemetryItemForTest(2),
            1000,
        );

        expect(lastAccepted).toBe(true);
        expect(dropped).toBe(false);
        expect(readTelemetryRowsForTest(databaseFilePath)).toHaveLength(
            telemetryOutboxMaxEvents,
        );
    });

    test("rolls the insert back when its follow-up step fails", async () => {
        const root = await createTemporaryDirectory("telemetry-outbox-atomic");
        temporaryDirectories.track(root);
        const databaseFilePath = join(root, "oo.sqlite");

        await expect(withSharedSqliteDatabase(
            databaseFilePath,
            database => enqueueTelemetryBatchItem({
                afterInsert: () => {
                    throw new Error("follow-up failed");
                },
                database,
                item: createTelemetryItemForTest(1),
                nowMs: 1000,
            }),
        )).rejects.toThrow("follow-up failed");

        expect(readTelemetryRowsForTest(databaseFilePath)).toEqual([]);
    });

    test("reads and purges nothing without creating a missing database", async () => {
        const root = await createTemporaryDirectory("telemetry-outbox-missing");
        temporaryDirectories.track(root);
        const databaseFilePath = join(root, "oo.sqlite");

        await withSharedSqliteDatabase(databaseFilePath, (database) => {
            expect(readTelemetryOutboxSummary(database)).toEqual({ pendingCount: 0 });
            purgeTelemetryOutboxIfExists(database);
        });

        expect(await Bun.file(databaseFilePath).exists()).toBeFalse();
    });

    test("summarizes and purges pending events", async () => {
        const root = await createTemporaryDirectory("telemetry-outbox-summary");
        temporaryDirectories.track(root);
        const databaseFilePath = join(root, "oo.sqlite");

        await enqueueTelemetryItemForTest(
            databaseFilePath,
            createTelemetryItemForTest(1),
            1000,
        );
        await withSharedSqliteDatabase(databaseFilePath, (database) => {
            expect(readTelemetryOutboxSummary(database)).toEqual({
                lastFlushAtMs: undefined,
                pendingCount: 1,
            });

            purgeTelemetryOutboxIfExists(database);

            expect(readTelemetryOutboxSummary(database).pendingCount).toBe(0);
        });
    });

    test("repairs invalid persisted device ids with a stable uuid v7", async () => {
        const root = await createTemporaryDirectory("telemetry-outbox-device-id");
        temporaryDirectories.track(root);
        const directoryPath = join(root, "telemetry");

        await mkdir(directoryPath, { recursive: true });
        await Bun.write(resolveTelemetryDeviceIdFilePath(directoryPath), "");

        const created = await readOrCreateTelemetryDeviceId(directoryPath);
        const next = await readOrCreateTelemetryDeviceId(directoryPath);

        expect(created.isFirstRun).toBe(true);
        expect(isUuidV7(created.deviceId)).toBe(true);
        expect(await readTelemetryDeviceIdIfExists(directoryPath)).toBe(
            created.deviceId,
        );
        expect(next).toEqual({
            deviceId: created.deviceId,
            isFirstRun: false,
        });
    });
});
