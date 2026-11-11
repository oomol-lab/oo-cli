import type { FlushTelemetryOutboxOptions } from "../flusher.ts";
import type { TelemetryBatchItem } from "../payload.ts";
import { withSharedSqliteDatabase } from "../../../../__tests__/helpers.ts";
import { flushTelemetryOutbox } from "../flusher.ts";
import { enqueueTelemetryBatchItem } from "../outbox.ts";
import { createCliCommandTelemetryPayload } from "../payload.ts";

// Each helper below opens the shared database, uses it and closes it again,
// the way a separate CLI process would.
export async function enqueueTelemetryItemForTest(
    databaseFilePath: string,
    item: TelemetryBatchItem,
    nowMs: number,
): Promise<boolean> {
    return withSharedSqliteDatabase(
        databaseFilePath,
        database => enqueueTelemetryBatchItem({ database, item, nowMs }),
    );
}

export async function flushTelemetryOutboxForTest(
    databaseFilePath: string,
    options: Omit<FlushTelemetryOutboxOptions, "database">,
): Promise<void> {
    await withSharedSqliteDatabase(
        databaseFilePath,
        database => flushTelemetryOutbox({ ...options, database }),
    );
}

export function createTelemetryItemForTest(index: number) {
    const uuidSuffix = index.toString(16).padStart(12, "0").slice(-12);

    return createCliCommandTelemetryPayload({
        accountState: "anonymous",
        agentClient: "unknown",
        arch: "arm64",
        ciName: "none",
        cliCommit: "unknown",
        cliInstallMethod: "unknown",
        cliVersion: "0.0.0",
        command: {
            argCount: 0,
            commandAction: "list",
            commandFull: "config.list",
            commandGroup: "config",
            flagsCount: 0,
            outputFormat: "text",
        },
        distinctId: "019a0cca-0000-7000-8000-000000000001",
        durationMs: 1,
        isCi: false,
        isFirstRun: false,
        isTtyStderr: false,
        isTtyStdout: false,
        lang: "en",
        os: "linux",
        osVersion: "1",
        outcome: {
            exitCode: 0,
        },
        runtimeVersion: "1",
        sessionId: "019a0ccb-1111-7222-8333-444444444444",
        timestamp: new Date("2026-05-07T12:34:56.789Z"),
        uuid: `019a0ccb-408c-728a-9df9-${uuidSuffix}`,
    });
}
