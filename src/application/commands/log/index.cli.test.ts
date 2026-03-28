import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox, createCliSnapshot } from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";

describe("log CLI", () => {
    test("prints the resolved log directory path", async () => {
        const sandbox = await createCliSandbox();

        try {
            const logDirectoryPath = resolveStorePaths({
                appName: APP_NAME,
                env: sandbox.env,
                platform: process.platform,
            }).logDirectoryPath;
            const result = await sandbox.run(["log", "path"]);

            expect(result).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: `${logDirectoryPath}\n`,
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints the previous log file by default", async () => {
        const sandbox = await createCliSandbox();

        try {
            const logDirectoryPath = resolveStorePaths({
                appName: APP_NAME,
                env: sandbox.env,
                platform: process.platform,
            }).logDirectoryPath;

            await mkdir(logDirectoryPath, { recursive: true });
            await Bun.write(join(logDirectoryPath, "debug-0001.log"), "first-log");
            await Bun.write(join(logDirectoryPath, "debug-0002.log"), "second-log");

            const result = await sandbox.run(["log", "print"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints a selected previous log file by index", async () => {
        const sandbox = await createCliSandbox();

        try {
            const logDirectoryPath = resolveStorePaths({
                appName: APP_NAME,
                env: sandbox.env,
                platform: process.platform,
            }).logDirectoryPath;

            await mkdir(logDirectoryPath, { recursive: true });
            await Bun.write(join(logDirectoryPath, "debug-0001.log"), "first-log");
            await Bun.write(join(logDirectoryPath, "debug-0002.log"), "second-log");
            await Bun.write(join(logDirectoryPath, "debug-0003.log"), "third-log");

            const result = await sandbox.run(["log", "print", "2"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
