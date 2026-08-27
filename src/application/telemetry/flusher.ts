import type { Logger } from "pino";
import type { Fetcher } from "../contracts/cli.ts";
import type { TelemetryEventRow } from "./outbox.ts";
import type {
    TelemetryBatchItem,
} from "./payload.ts";
import { Buffer } from "node:buffer";
import {
    telemetryBaseBackoffMs,
    telemetryChunkMaxBytes,
    telemetryChunkMaxEvents,
    telemetryEndpoint,
    telemetryMaxAttempts,
    telemetryMaxBackoffMs,
    telemetryRequestTimeoutMs,
} from "./constants.ts";
import { resolveTelemetryStatusFromSettingsFile } from "./control.ts";
import {
    deleteExpiredTelemetryEvents,
    deleteTelemetryRows,
    leaseReadyTelemetryRows,
    openTelemetryDatabase,
    parseTelemetryRowPayload,
    recordTelemetryRowsAttempted,
    releaseTelemetryRowsWithoutAttempt,
    writeTelemetryStateNumber,
} from "./outbox.ts";
import { createTelemetryBatchRequestBody } from "./payload.ts";

export interface FlushTelemetryOutboxOptions {
    directoryPath: string;
    env: Record<string, string | undefined>;
    fetcher?: Fetcher;
    logger?: Logger;
    now?: () => number;
    random?: () => number;
    requestTimeoutMs?: number;
    settingsFilePath: string;
}

interface TelemetryChunk {
    body: string;
    rows: TelemetryEventRow[];
}

export async function flushTelemetryOutbox(
    options: FlushTelemetryOutboxOptions,
): Promise<void> {
    const now = options.now ?? Date.now;
    const random = options.random ?? Math.random;
    const fetcher = options.fetcher ?? fetch;
    const requestTimeoutMs = options.requestTimeoutMs ?? telemetryRequestTimeoutMs;
    const database = openTelemetryDatabase(options.directoryPath, options.logger);

    try {
        const nowMs = now();

        deleteExpiredTelemetryEvents(database, nowMs);

        const leasedRows = leaseReadyTelemetryRows(database, nowMs);

        if (leasedRows.length === 0) {
            return;
        }

        const status = await resolveTelemetryStatusFromSettingsFile({
            env: options.env,
            logger: options.logger,
            settingsFilePath: options.settingsFilePath,
        });

        if (!status.enabled) {
            releaseTelemetryRowsWithoutAttempt(database, leasedRows, nowMs);
            return;
        }

        const { chunks, poisonRows } = createTelemetryChunks(leasedRows);

        deleteTelemetryRows(database, poisonRows);

        for (let chunkIndex = 0; chunkIndex < chunks.length;) {
            const chunk = chunks[chunkIndex]!;
            const response = await postTelemetryChunk(
                fetcher,
                chunk.body,
                requestTimeoutMs,
            );

            if (response.kind === "success") {
                deleteTelemetryRows(database, chunk.rows);
                writeTelemetryStateNumber(database, "last_flush_at_ms", now());
                chunkIndex += 1;
                continue;
            }

            if (
                response.kind === "payload_too_large"
                && chunk.rows.length > 1
            ) {
                chunks.splice(chunkIndex, 1, ...splitTelemetryChunk(chunk));
                continue;
            }

            if (
                response.kind === "permanent"
                || response.kind === "payload_too_large"
            ) {
                deleteTelemetryRows(database, chunk.rows);
                chunkIndex += 1;
                continue;
            }

            const failedAtMs = now();
            const availableAtMs = failedAtMs
                + calculateTelemetryBackoffMs(chunk.rows, random);
            const laterRows = chunks
                .slice(chunkIndex + 1)
                .flatMap(laterChunk => laterChunk.rows);

            recordTelemetryRowsAttempted(database, chunk.rows, {
                availableAtMs,
                maxAttempts: telemetryMaxAttempts,
            });
            releaseTelemetryRowsWithoutAttempt(database, laterRows, availableAtMs);
            writeTelemetryStateNumber(
                database,
                "next_spawn_after_ms",
                availableAtMs,
            );
            return;
        }
    }
    finally {
        database.close();
    }
}

function createTelemetryChunks(rows: readonly TelemetryEventRow[]): {
    chunks: TelemetryChunk[];
    poisonRows: TelemetryEventRow[];
} {
    const chunks: TelemetryChunk[] = [];
    const poisonRows: TelemetryEventRow[] = [];
    let currentRows: TelemetryEventRow[] = [];
    let currentItems: TelemetryBatchItem[] = [];

    for (const row of rows) {
        const item = parseTelemetryRowPayload(row);

        if (item === undefined) {
            poisonRows.push(row);
            continue;
        }

        const nextItems = [...currentItems, item];
        const nextBody = createTelemetryBatchRequestBody(nextItems);

        if (
            currentRows.length > 0
            && (
                currentRows.length >= telemetryChunkMaxEvents
                || Buffer.byteLength(nextBody, "utf8") > telemetryChunkMaxBytes
            )
        ) {
            chunks.push({
                body: createTelemetryBatchRequestBody(currentItems),
                rows: currentRows,
            });
            currentRows = [row];
            currentItems = [item];
            continue;
        }

        currentRows.push(row);
        currentItems.push(item);
    }

    if (currentRows.length > 0) {
        chunks.push({
            body: createTelemetryBatchRequestBody(currentItems),
            rows: currentRows,
        });
    }

    return {
        chunks,
        poisonRows,
    };
}

async function postTelemetryChunk(
    fetcher: Fetcher,
    body: string,
    timeoutMs: number,
): Promise<{
    kind: "payload_too_large" | "permanent" | "retriable" | "success";
}> {
    try {
        const response = await fetcher(telemetryEndpoint, {
            body,
            headers: {
                "content-type": "application/json",
            },
            method: "POST",
            signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok) {
            return { kind: "success" };
        }

        if (response.status === 413) {
            return { kind: "payload_too_large" };
        }

        if (response.status === 400) {
            return { kind: "permanent" };
        }

        if (
            response.status === 408
            || response.status === 429
            || response.status >= 500
        ) {
            return { kind: "retriable" };
        }

        return { kind: "permanent" };
    }
    catch {
        return { kind: "retriable" };
    }
}

function splitTelemetryChunk(chunk: TelemetryChunk): [TelemetryChunk, TelemetryChunk] {
    const splitIndex = Math.max(1, Math.floor(chunk.rows.length / 2));

    return [
        createTelemetryChunkFromRows(chunk.rows.slice(0, splitIndex)),
        createTelemetryChunkFromRows(chunk.rows.slice(splitIndex)),
    ];
}

function createTelemetryChunkFromRows(rows: TelemetryEventRow[]): TelemetryChunk {
    return {
        body: createTelemetryBatchRequestBody(
            rows.map(readTelemetryBatchItem),
        ),
        rows,
    };
}

function readTelemetryBatchItem(row: TelemetryEventRow): TelemetryBatchItem {
    const item = parseTelemetryRowPayload(row);

    if (item === undefined) {
        throw new TypeError("Telemetry chunk row became invalid during split.");
    }

    return item;
}

function calculateTelemetryBackoffMs(
    rows: readonly TelemetryEventRow[],
    random: () => number,
): number {
    const nextAttempts = Math.max(
        1,
        ...rows.map(row => row.attempts + 1),
    );
    const exponentialBackoff = Math.min(
        telemetryBaseBackoffMs * 2 ** (nextAttempts - 1),
        telemetryMaxBackoffMs,
    );
    const jitter = Math.floor(exponentialBackoff * 0.2 * random());

    return Math.min(exponentialBackoff + jitter, telemetryMaxBackoffMs);
}
