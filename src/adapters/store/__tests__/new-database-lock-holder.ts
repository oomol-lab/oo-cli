// Child process of a test in ../sqlite-utils.test.ts. It plays an `oo`
// process that is in the middle of its first write to a brand-new database
// file, which is still in rollback-journal mode at that point.
import { existsSync, writeFileSync } from "node:fs";
import process from "node:process";
import { Database } from "bun:sqlite";

const [
    databaseFilePath,
    lockedMarkerPath,
    releaseMarkerPath,
    holdMsText,
] = process.argv.slice(2);
const database = new Database(databaseFilePath!, { create: true, strict: true });

// Lets the commit below wait out the other process's retries.
database.run("PRAGMA busy_timeout = 30000;");
database.run("BEGIN IMMEDIATE;");
database.run("CREATE TABLE held (id INTEGER PRIMARY KEY);");
// Tells the test that the write lock is held from here on.
writeFileSync(lockedMarkerPath!, "");

// The hold is timed from the moment the test creates the release marker, which
// it does right before it starts waiting for the lock. However late this
// process is scheduled, the test therefore waits for at least the whole hold.
while (!existsSync(releaseMarkerPath!)) {
    await Bun.sleep(5);
}

await Bun.sleep(Number(holdMsText));
database.run("COMMIT;");
database.close();
