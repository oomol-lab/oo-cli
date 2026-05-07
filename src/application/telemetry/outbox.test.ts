import { mkdir, truncate } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import {
    createTemporaryDirectory,
    useTemporaryDirectoryCleanup,
} from "../../../__tests__/helpers.ts";
import { createTelemetryItemForTest } from "./__tests__/helpers.ts";
import { telemetryDatabaseMaxBytes } from "./constants.ts";
import {
    enqueueTelemetryBatchItem,
    readOrCreateTelemetryDeviceId,
    readTelemetryDeviceIdIfExists,
    readTelemetryRowsForTest,
    resolveTelemetryDatabaseFilePath,
    resolveTelemetryDeviceIdFilePath,
} from "./outbox.ts";
import { isUuidV7 } from "./uuid.ts";

describe("telemetry outbox", () => {
    const temporaryDirectories = useTemporaryDirectoryCleanup();

    test("resets a corrupt database without failing enqueue", async () => {
        const root = await createTemporaryDirectory("telemetry-outbox-corrupt");
        temporaryDirectories.track(root);
        const directoryPath = join(root, "telemetry");

        await mkdir(directoryPath, { recursive: true });
        await Bun.write(resolveTelemetryDatabaseFilePath(directoryPath), "not sqlite");

        const inserted = enqueueTelemetryBatchItem({
            directoryPath,
            item: createTelemetryItemForTest(1),
            nowMs: 1000,
        });

        expect(inserted).toBe(true);
        expect(readTelemetryRowsForTest(directoryPath)).toHaveLength(1);
    });

    test("drops new rows when the database file is over the hard limit", async () => {
        const root = await createTemporaryDirectory("telemetry-outbox-hard-limit");
        temporaryDirectories.track(root);
        const directoryPath = join(root, "telemetry");
        const databaseFilePath = resolveTelemetryDatabaseFilePath(directoryPath);

        await mkdir(directoryPath, { recursive: true });
        await Bun.write(databaseFilePath, "");
        await truncate(databaseFilePath, telemetryDatabaseMaxBytes);

        const inserted = enqueueTelemetryBatchItem({
            directoryPath,
            item: createTelemetryItemForTest(1),
            nowMs: 1000,
        });

        expect(inserted).toBe(false);
    });

    test("includes sqlite sidecar files in the hard limit", async () => {
        const root = await createTemporaryDirectory("telemetry-outbox-sidecar-limit");
        temporaryDirectories.track(root);
        const directoryPath = join(root, "telemetry");
        const databaseFilePath = resolveTelemetryDatabaseFilePath(directoryPath);

        await mkdir(directoryPath, { recursive: true });
        await Bun.write(databaseFilePath, "");
        await Bun.write(`${databaseFilePath}-wal`, "");
        await truncate(`${databaseFilePath}-wal`, telemetryDatabaseMaxBytes);

        const inserted = enqueueTelemetryBatchItem({
            directoryPath,
            item: createTelemetryItemForTest(1),
            nowMs: 1000,
        });

        expect(inserted).toBe(false);
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
