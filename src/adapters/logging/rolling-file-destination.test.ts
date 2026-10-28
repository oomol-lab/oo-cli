import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../__tests__/helpers.ts";
import { RollingFileDestination } from "./rolling-file-destination.ts";

describe("RollingFileDestination", () => {
    test("removes log files before the local date retention window", async () => {
        const directoryPath = await createTemporaryDirectory("oo-log-retention");

        await Bun.write(join(directoryPath, "debug-2026-03-18_23-59-59-p123.log"), "expired\n");
        await Bun.write(join(directoryPath, "debug-2026-03-19_00-00-00-p123.log"), "boundary\n");
        await Bun.write(join(directoryPath, "debug-2026-03-24_23-59-59-p123.log"), "recent\n");
        const destination = createRetentionTestDestination(directoryPath);

        destination.write("current\n");
        destination.end();

        const fileNames = (await readdir(directoryPath)).sort();
        const contents = await Promise.all(
            fileNames.map(fileName =>
                readFile(join(directoryPath, fileName), "utf8"),
            ),
        );
        const mergedContent = contents.join("");

        expect(fileNames).not.toContain("debug-2026-03-18_23-59-59-p123.log");
        expect(fileNames).toContain("debug-2026-03-19_00-00-00-p123.log");
        expect(fileNames).toContain("debug-2026-03-24_23-59-59-p123.log");
        expect(fileNames).toContain("debug-2026-03-25_15-30-12-p123.log");
        expect(mergedContent).not.toContain("expired");
        expect(mergedContent).toContain("boundary");
        expect(mergedContent).toContain("recent");
        expect(mergedContent).toContain("current");
    });

    test("keeps every log file inside the retention window", async () => {
        const directoryPath = await createTemporaryDirectory("oo-log-no-count-limit");

        await Promise.all(Array.from({ length: 25 }, (_, index) =>
            Bun.write(
                join(
                    directoryPath,
                    `debug-2026-03-24_00-00-${String(index).padStart(2, "0")}-p${index}.log`,
                ),
                `log-${index}\n`,
            )));
        const destination = createRetentionTestDestination(directoryPath);

        destination.write("current\n");
        destination.end();

        const logFileNames = (await readdir(directoryPath))
            .filter(fileName => fileName.endsWith(".log"));

        expect(logFileNames.length).toBe(26);
    });

    test("prunes at most once per local retention window", async () => {
        const directoryPath = await createTemporaryDirectory("oo-log-prune-cache");
        const boundaryFileName = "debug-2026-03-19_00-00-00-p123.log";
        const lateExpiredFileName = "debug-2026-03-18_23-59-59-p456.log";
        let currentNow = new Date(2026, 2, 25, 15, 30, 12);

        await Bun.write(join(directoryPath, boundaryFileName), "boundary\n");
        const destination = createRetentionTestDestination(
            directoryPath,
            () => currentNow,
        );

        destination.write("first\n");
        await Bun.write(join(directoryPath, lateExpiredFileName), "late expired\n");
        destination.write("second\n");

        expect(await readdir(directoryPath)).toContain(lateExpiredFileName);

        currentNow = new Date(2026, 2, 26, 0, 0, 0);
        destination.write("third\n");
        destination.end();

        const fileNames = await readdir(directoryPath);

        expect(fileNames).not.toContain(boundaryFileName);
        expect(fileNames).not.toContain(lateExpiredFileName);
    });

    test("skips pruning when another invocation already pruned the retention window", async () => {
        const directoryPath = await createTemporaryDirectory("oo-log-prune-marker");
        const expiredFileName = "debug-2026-03-18_23-59-59-p456.log";
        const firstDestination = createRetentionTestDestination(directoryPath);

        firstDestination.write("first\n");
        firstDestination.end();
        await Bun.write(join(directoryPath, expiredFileName), "expired\n");

        const secondDestination = createRetentionTestDestination(directoryPath);

        secondDestination.write("second\n");
        secondDestination.end();

        expect(await readdir(directoryPath)).toContain(expiredFileName);

        const nextDayDestination = createRetentionTestDestination(
            directoryPath,
            () => new Date(2026, 2, 26, 9, 0, 0),
        );

        nextDayDestination.write("third\n");
        nextDayDestination.end();

        expect(await readdir(directoryPath)).not.toContain(expiredFileName);
    });

    test("keeps prune markers separate for destinations with different prefixes", async () => {
        const directoryPath = await createTemporaryDirectory("oo-log-prune-prefix");
        const expiredTraceFileName = "trace-2026-03-18_23-59-59-p456.log";
        const debugDestination = createRetentionTestDestination(directoryPath);

        await Bun.write(join(directoryPath, expiredTraceFileName), "expired\n");
        debugDestination.write("debug\n");
        debugDestination.end();

        expect(await readdir(directoryPath)).toContain(expiredTraceFileName);

        const traceDestination = new RollingFileDestination({
            directoryPath,
            filePrefix: "trace",
            now: () => new Date(2026, 2, 25, 15, 30, 12),
            pid: 123,
        });

        traceDestination.write("trace\n");
        traceDestination.end();

        expect(await readdir(directoryPath)).not.toContain(expiredTraceFileName);
    });

    test("appends a counter when the log file name is already taken", async () => {
        const directoryPath = await createTemporaryDirectory("oo-log-name-taken");
        const baseFileName = "debug-2026-03-25_15-30-12-p123.log";

        await Bun.write(join(directoryPath, baseFileName), "existing\n");
        const destination = createRetentionTestDestination(directoryPath);

        destination.write("current\n");
        destination.end();

        expect(destination.getFilePath()).not.toBe(join(directoryPath, baseFileName));
        expect(destination.getFilePath().startsWith(
            join(directoryPath, "debug-2026-03-25_15-30-12-p123-"),
        )).toBeTrue();
        expect(await readFile(join(directoryPath, baseFileName), "utf8")).toBe("existing\n");
        expect(await readFile(destination.getFilePath(), "utf8")).toBe("current\n");
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

function createRetentionTestDestination(
    directoryPath: string,
    now = () => new Date(2026, 2, 25, 15, 30, 12),
): RollingFileDestination {
    return new RollingFileDestination({
        directoryPath,
        now,
        pid: 123,
    });
}
