import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../__tests__/helpers.ts";
import { RollingFileDestination } from "./rolling-file-destination.ts";

describe("RollingFileDestination", () => {
    test("removes the oldest log file after the file-count limit is exceeded", async () => {
        const directoryPath = await createTemporaryDirectory("oo-log-rotation");

        await Bun.write(join(directoryPath, "debug-2026-03-24_23-59-58-p123.log"), "first\n");
        await Bun.write(join(directoryPath, "debug-2026-03-24_23-59-59-p123.log"), "second\n");
        const destination = new RollingFileDestination({
            directoryPath,
            maxFiles: 2,
            now: () => new Date("2026-03-25T00:00:00.000Z"),
            pid: 123,
        });

        destination.write("third\n");
        destination.end();

        const fileNames = (await readdir(directoryPath)).sort();
        const contents = await Promise.all(
            fileNames.map(fileName =>
                readFile(join(directoryPath, fileName), "utf8"),
            ),
        );
        const mergedContent = contents.join("");

        expect(fileNames.length).toBe(2);
        expect(mergedContent).not.toContain("first");
        expect(mergedContent).toContain("second");
        expect(mergedContent).toContain("third");
    });

    test("uses a human-readable local timestamp and pid in the log file name", async () => {
        const directoryPath = await createTemporaryDirectory("oo-log-name");
        const destination = new RollingFileDestination({
            directoryPath,
            now: () => new Date(2026, 2, 25, 6, 30, 12),
            pid: 12345,
        });

        expect(destination.getFilePath()).toContain(
            "debug-2026-03-25_06-30-12-p12345.log",
        );
    });
});
