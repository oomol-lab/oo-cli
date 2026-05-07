import { Buffer } from "node:buffer";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import {
    createTemporaryDirectory,
    useTemporaryDirectoryCleanup,
} from "../../../__tests__/helpers.ts";
import { renderSettingsFile } from "../schemas/settings.ts";
import { createTelemetryItemForTest } from "./__tests__/helpers.ts";
import {
    telemetryChunkMaxBytes,
    telemetryLeaseMaxEvents,
    telemetryLeaseTtlMs,
    telemetryMaxEventAgeMs,
} from "./constants.ts";
import { flushTelemetryOutbox } from "./flusher.ts";
import {
    closeTelemetryDatabase,
    enqueueTelemetryBatchItem,
    leaseReadyTelemetryRows,
    openTelemetryDatabase,
    readTelemetryRowsForTest,
} from "./outbox.ts";

describe("telemetry flusher", () => {
    const temporaryDirectories = useTemporaryDirectoryCleanup();

    test("deletes successful chunks and keeps failed plus later chunks", async () => {
        const root = await createTemporaryDirectory("telemetry-flush-partial");
        temporaryDirectories.track(root);
        const directoryPath = join(root, "telemetry");
        const settingsFilePath = join(root, "settings.toml");
        let requestCount = 0;

        for (let index = 0; index < 201; index += 1) {
            enqueueTelemetryBatchItem({
                directoryPath,
                item: createTelemetryItemForTest(index),
                nowMs: 1000 + index,
            });
        }

        await flushTelemetryOutbox({
            directoryPath,
            env: {},
            fetcher: async () => {
                requestCount += 1;
                return new Response("", {
                    status: requestCount === 1 ? 200 : 503,
                });
            },
            now: () => 10_000,
            random: () => 0,
            settingsFilePath,
        });

        const rows = readTelemetryRowsForTest(directoryPath);
        const attemptedRows = rows.filter(row => row.attempts === 1);
        const unsentRows = rows.filter(row => row.attempts === 0);

        expect(requestCount).toBe(2);
        expect(rows).toHaveLength(101);
        expect(attemptedRows).toHaveLength(100);
        expect(unsentRows).toHaveLength(1);
    });

    test("flushes large outboxes as bounded request chunks", async () => {
        const root = await createTemporaryDirectory("telemetry-flush-large-outbox");
        temporaryDirectories.track(root);
        const directoryPath = join(root, "telemetry");
        const settingsFilePath = join(root, "settings.toml");
        const eventCount = 1500;
        const requestSizes: number[] = [];

        for (let index = 0; index < eventCount; index += 1) {
            const item = createTelemetryItemForTest(index);

            item.properties.large_value = "x".repeat(3000);

            expect(enqueueTelemetryBatchItem({
                directoryPath,
                item,
                nowMs: 1000 + index,
            })).toBeTrue();
        }

        const rowsBefore = readTelemetryRowsForTest(directoryPath);
        const totalPayloadBytes = rowsBefore.reduce(
            (total, row) => total + row.payloadBytes,
            0,
        );

        expect(rowsBefore).toHaveLength(eventCount);
        expect(totalPayloadBytes).toBeGreaterThan(5 * 1024 * 1024);

        await flushTelemetryOutbox({
            directoryPath,
            env: {},
            fetcher: async (_, init) => {
                requestSizes.push(Buffer.byteLength(String(init?.body ?? ""), "utf8"));
                return new Response("");
            },
            now: () => 10_000,
            settingsFilePath,
        });

        expect(Math.max(...requestSizes)).toBeLessThanOrEqual(telemetryChunkMaxBytes);
        expect(readTelemetryRowsForTest(directoryPath)).toHaveLength(
            eventCount - telemetryLeaseMaxEvents,
        );
    });

    test("drops rows after the second failed post attempt", async () => {
        const root = await createTemporaryDirectory("telemetry-flush-attempts");
        temporaryDirectories.track(root);
        const directoryPath = join(root, "telemetry");
        const settingsFilePath = join(root, "settings.toml");

        enqueueTelemetryBatchItem({
            directoryPath,
            item: createTelemetryItemForTest(1),
            nowMs: 1000,
        });

        await flushTelemetryOutbox({
            directoryPath,
            env: {},
            fetcher: async () => new Response("", { status: 503 }),
            now: () => 10_000,
            random: () => 0,
            settingsFilePath,
        });
        expect(readTelemetryRowsForTest(directoryPath)).toMatchObject([
            { attempts: 1 },
        ]);

        await flushTelemetryOutbox({
            directoryPath,
            env: {},
            fetcher: async () => new Response("", { status: 503 }),
            now: () => 80_000,
            random: () => 0,
            settingsFilePath,
        });

        expect(readTelemetryRowsForTest(directoryPath)).toEqual([]);
    });

    test("treats timed out post requests as retryable failures", async () => {
        const root = await createTemporaryDirectory("telemetry-flush-timeout");
        temporaryDirectories.track(root);
        const directoryPath = join(root, "telemetry");
        const settingsFilePath = join(root, "settings.toml");
        let signalSeen = false;

        enqueueTelemetryBatchItem({
            directoryPath,
            item: createTelemetryItemForTest(1),
            nowMs: 1000,
        });

        await flushTelemetryOutbox({
            directoryPath,
            env: {},
            fetcher: async (_, init) => {
                const signal = init?.signal;

                expect(signal).toBeInstanceOf(AbortSignal);
                signalSeen = true;

                return await new Promise<Response>((_, reject) => {
                    signal?.addEventListener(
                        "abort",
                        () => reject(new Error("aborted")),
                        { once: true },
                    );
                });
            },
            now: () => 10_000,
            random: () => 0,
            requestTimeoutMs: 1,
            settingsFilePath,
        });

        expect(signalSeen).toBe(true);
        expect(readTelemetryRowsForTest(directoryPath)).toMatchObject([
            {
                attempts: 1,
                leaseUntilMs: null,
            },
        ]);
    });

    test("drops expired rows before posting", async () => {
        const root = await createTemporaryDirectory("telemetry-flush-expired");
        temporaryDirectories.track(root);
        const directoryPath = join(root, "telemetry");
        const settingsFilePath = join(root, "settings.toml");
        let requestCount = 0;

        enqueueTelemetryBatchItem({
            directoryPath,
            item: createTelemetryItemForTest(1),
            nowMs: 1000,
        });

        await flushTelemetryOutbox({
            directoryPath,
            env: {},
            fetcher: async () => {
                requestCount += 1;
                return new Response("");
            },
            now: () => 1000 + telemetryMaxEventAgeMs + 1,
            settingsFilePath,
        });

        expect(requestCount).toBe(0);
        expect(readTelemetryRowsForTest(directoryPath)).toEqual([]);
    });

    test("rechecks opt-out before posting", async () => {
        const root = await createTemporaryDirectory("telemetry-flush-opt-out");
        temporaryDirectories.track(root);
        const directoryPath = join(root, "telemetry");
        const settingsFilePath = join(root, "settings.toml");
        let requestCount = 0;

        await Bun.write(
            settingsFilePath,
            renderSettingsFile({
                telemetry: {
                    enabled: false,
                },
            }),
        );
        enqueueTelemetryBatchItem({
            directoryPath,
            item: createTelemetryItemForTest(1),
            nowMs: 1000,
        });

        await flushTelemetryOutbox({
            directoryPath,
            env: {},
            fetcher: async () => {
                requestCount += 1;
                return new Response("");
            },
            now: () => 10_000,
            settingsFilePath,
        });

        expect(requestCount).toBe(0);
        expect(readTelemetryRowsForTest(directoryPath)).toMatchObject([
            {
                attempts: 0,
                leaseUntilMs: null,
            },
        ]);
    });

    test("drops poison rows without blocking later valid rows", async () => {
        const root = await createTemporaryDirectory("telemetry-flush-poison");
        temporaryDirectories.track(root);
        const directoryPath = join(root, "telemetry");
        const settingsFilePath = join(root, "settings.toml");
        let requestBody: string | undefined;
        const poisonItem = createTelemetryItemForTest(1);
        const validItem = createTelemetryItemForTest(2);

        enqueueTelemetryBatchItem({
            directoryPath,
            item: poisonItem,
            nowMs: 1000,
        });
        enqueueTelemetryBatchItem({
            directoryPath,
            item: validItem,
            nowMs: 1001,
        });

        const database = openTelemetryDatabase(directoryPath);

        try {
            database.query(
                "UPDATE telemetry_events SET payload_json = $payloadJson WHERE id = $id",
            ).run({
                id: poisonItem.uuid,
                payloadJson: JSON.stringify({ event: "invalid" }),
            });
        }
        finally {
            closeTelemetryDatabase(database);
        }

        await flushTelemetryOutbox({
            directoryPath,
            env: {},
            fetcher: async (_, init) => {
                requestBody = String(init?.body ?? "");
                return new Response("");
            },
            now: () => 10_000,
            settingsFilePath,
        });

        expect(readTelemetryRowsForTest(directoryPath)).toEqual([]);
        expect(JSON.parse(requestBody ?? "{}")).toMatchObject({
            batch: [
                {
                    uuid: validItem.uuid,
                },
            ],
        });
    });

    test("splits multi-row payload-too-large chunks before deleting rows", async () => {
        const root = await createTemporaryDirectory("telemetry-flush-split-413");
        temporaryDirectories.track(root);
        const directoryPath = join(root, "telemetry");
        const settingsFilePath = join(root, "settings.toml");
        const requestBatches: string[][] = [];
        const items = [1, 2, 3].map(index => createTelemetryItemForTest(index));

        for (const [index, item] of items.entries()) {
            enqueueTelemetryBatchItem({
                directoryPath,
                item,
                nowMs: 1000 + index,
            });
        }

        await flushTelemetryOutbox({
            directoryPath,
            env: {},
            fetcher: async (_, init) => {
                const request = JSON.parse(String(init?.body ?? "{}")) as {
                    batch: { uuid: string }[];
                };

                requestBatches.push(request.batch.map(item => item.uuid));

                return new Response("", {
                    status: requestBatches.length === 1 ? 413 : 200,
                });
            },
            now: () => 10_000,
            settingsFilePath,
        });

        expect(requestBatches).toEqual([
            items.map(item => item.uuid),
            [items[0]!.uuid],
            [items[1]!.uuid, items[2]!.uuid],
        ]);
        expect(readTelemetryRowsForTest(directoryPath)).toEqual([]);
    });

    test("drops single-row payload-too-large chunks", async () => {
        const root = await createTemporaryDirectory("telemetry-flush-single-413");
        temporaryDirectories.track(root);
        const directoryPath = join(root, "telemetry");
        const settingsFilePath = join(root, "settings.toml");
        let requestCount = 0;

        enqueueTelemetryBatchItem({
            directoryPath,
            item: createTelemetryItemForTest(1),
            nowMs: 1000,
        });

        await flushTelemetryOutbox({
            directoryPath,
            env: {},
            fetcher: async () => {
                requestCount += 1;
                return new Response("", { status: 413 });
            },
            now: () => 10_000,
            settingsFilePath,
        });

        expect(requestCount).toBe(1);
        expect(readTelemetryRowsForTest(directoryPath)).toEqual([]);
    });

    test("does not count a leased row as attempted before posting starts", async () => {
        const root = await createTemporaryDirectory("telemetry-flush-crash-before-post");
        temporaryDirectories.track(root);
        const directoryPath = join(root, "telemetry");
        const settingsFilePath = join(root, "settings.toml");
        const leasedAtMs = 10_000;
        let requestCount = 0;

        enqueueTelemetryBatchItem({
            directoryPath,
            item: createTelemetryItemForTest(1),
            nowMs: 1000,
        });

        const database = openTelemetryDatabase(directoryPath);

        try {
            expect(leaseReadyTelemetryRows(database, leasedAtMs)).toHaveLength(1);
        }
        finally {
            closeTelemetryDatabase(database);
        }

        await flushTelemetryOutbox({
            directoryPath,
            env: {},
            fetcher: async () => {
                requestCount += 1;
                return new Response("");
            },
            now: () => leasedAtMs + telemetryLeaseTtlMs - 1,
            settingsFilePath,
        });

        expect(requestCount).toBe(0);
        expect(readTelemetryRowsForTest(directoryPath)).toMatchObject([
            {
                attempts: 0,
                leaseUntilMs: leasedAtMs + telemetryLeaseTtlMs,
            },
        ]);

        await flushTelemetryOutbox({
            directoryPath,
            env: {},
            fetcher: async () => {
                requestCount += 1;
                return new Response("");
            },
            now: () => leasedAtMs + telemetryLeaseTtlMs,
            settingsFilePath,
        });

        expect(requestCount).toBe(1);
        expect(readTelemetryRowsForTest(directoryPath)).toEqual([]);
    });
});
