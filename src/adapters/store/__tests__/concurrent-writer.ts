// Child process of the multi-process test in ../sqlite-utils.test.ts. It
// behaves like one `oo` invocation that uses every sqlite-backed store while
// other invocations do the same against the same database file.
import process from "node:process";
import { createTelemetryItemForTest } from "../../../application/telemetry/__tests__/helpers.ts";
import { enqueueTelemetryBatchItem } from "../../../application/telemetry/outbox.ts";
import { SqliteCacheStore } from "../../cache/sqlite-cache.ts";
import { SqliteFileUploadStore } from "../sqlite-file-upload-store.ts";
import { SharedSqliteDatabase } from "../sqlite-utils.ts";

const [databaseFilePath, writerIndexText, recordCountText, startAtMsText] = process.argv.slice(2);
const writerIndex = Number(writerIndexText);
const recordCount = Number(recordCountText);

// Every writer waits for the same instant so that they open, initialize and
// write to the database at once instead of one after another.
await Bun.sleep(Math.max(0, Number(startAtMsText) - Date.now()));

const database = new SharedSqliteDatabase(databaseFilePath!);

try {
    const cache = new SqliteCacheStore(database).getCache<number>({
        id: "concurrency",
        maxEntries: 32,
    });
    const uploadStore = new SqliteFileUploadStore(database);

    for (let index = 0; index < recordCount; index += 1) {
        cache.set(`${writerIndex}:${index}`, index);
        cache.get(`${writerIndex}:${index}`);
        uploadStore.save({
            downloadUrl: `https://example.com/${writerIndex}/${index}`,
            expiresAtMs: 2_000,
            fileName: `${writerIndex}-${index}.txt`,
            fileSize: index,
            id: `${writerIndex}-${index}`,
            uploadedAtMs: 1_000,
        });

        try {
            enqueueTelemetryBatchItem({
                database,
                item: createTelemetryItemForTest(writerIndex * 10_000 + index),
                nowMs: 1_000,
            });
        }
        catch {
            // Telemetry gives up on a busy database almost immediately, and
            // the CLI ignores that failure the same way.
        }
    }
}
finally {
    database.close();
}
