import { readdir, readFile, stat } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../__tests__/helpers.ts";
import { APP_NAME } from "../../application/config/app-config.ts";
import { createCliLogger } from "./create-cli-logger.ts";

describe("createCliLogger", () => {
    test("writes structured logs to disk by default", async () => {
        const logDirectoryPath = await createTemporaryDirectory("oo-log-file");
        const loggerHandle = createCliLogger({
            appName: APP_NAME,
            env: {},
            logDirectoryPath,
        });

        loggerHandle.logger.debug("file-only log");
        loggerHandle.close();

        const [fileName] = await readdir(logDirectoryPath);
        const content = await readFile(loggerHandle.logFilePath, "utf8");

        expect(loggerHandle.logFilePath.endsWith(fileName!)).toBeTrue();
        expect(content).toContain(`"name":"${APP_NAME}"`);
        expect(content).toContain(`"msg":"file-only log"`);
    });

    test("exposes the created log file path", async () => {
        const logDirectoryPath = await createTemporaryDirectory("oo-log-path");
        const loggerHandle = createCliLogger({
            appName: APP_NAME,
            env: {},
            logDirectoryPath,
        });

        loggerHandle.logger.info("path log");
        loggerHandle.close();

        await expect(stat(loggerHandle.logFilePath)).resolves.toMatchObject({
            isFile: expect.any(Function),
        });
    });

    test("allows only one active logger at a time", async () => {
        const logDirectoryPath = await createTemporaryDirectory("oo-log-singleton");
        const loggerHandle = createCliLogger({
            appName: APP_NAME,
            env: {},
            logDirectoryPath,
        });

        expect(() =>
            createCliLogger({
                appName: APP_NAME,
                env: {},
                logDirectoryPath,
            }),
        ).toThrow("Only one active CLI logger can exist at a time.");

        loggerHandle.close();
    });
});
