import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../__tests__/helpers.ts";
import { readHistoricalLog } from "./log-reader.ts";

describe("readHistoricalLog", () => {
    test("returns the previous log file while excluding the current log", async () => {
        const directoryPath = await createTemporaryDirectory("oo-log-reader");

        await mkdir(directoryPath, { recursive: true });
        await Bun.write(
            join(directoryPath, "debug-0001.log"),
            [
                "line-001",
                "line-002",
                "line-003",
            ].join("\n"),
        );
        await Bun.write(
            join(directoryPath, "debug-0002.log"),
            [
                "line-004",
                "line-005",
            ].join("\n"),
        );
        await Bun.write(
            join(directoryPath, "debug-0003.log"),
            [
                "line-006",
                "line-007",
            ].join("\n"),
        );

        const content = await readHistoricalLog({
            directoryPath,
            excludeFilePath: join(directoryPath, "debug-0003.log"),
            index: 1,
        });

        expect(content).toBe("line-004\nline-005");
    });

    test("returns the requested historical log by index", async () => {
        const directoryPath = await createTemporaryDirectory("oo-log-reader-index");

        await mkdir(directoryPath, { recursive: true });
        await Bun.write(join(directoryPath, "debug-0001.log"), "line-001");
        await Bun.write(join(directoryPath, "debug-0002.log"), "line-002");
        await Bun.write(join(directoryPath, "debug-0003.log"), "line-003");

        const content = await readHistoricalLog({
            directoryPath,
            excludeFilePath: join(directoryPath, "debug-0004.log"),
            index: 2,
        });

        expect(content).toBe("line-002");
    });

    test("returns undefined when the log directory does not exist", async () => {
        const content = await readHistoricalLog({
            directoryPath: "/tmp/oo-cli-log-reader-missing",
        });

        expect(content).toBeUndefined();
    });
});
