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

    test("sanitizes URL-bearing error paths before writing", async () => {
        const logDirectoryPath = await createTemporaryDirectory("oo-log-err-url");
        const loggerHandle = createCliLogger({
            appName: APP_NAME,
            env: {},
            logDirectoryPath,
        });

        loggerHandle.logger.warn(
            {
                err: Object.assign(new Error("Unable to connect."), {
                    code: "ConnectionRefused",
                    path: "https://download.example.com/file?signature=secret123",
                }),
            },
            "request failed",
        );
        loggerHandle.close();

        const content = await readFile(loggerHandle.logFilePath, "utf8");

        expect(content).not.toContain("secret123");
        expect(content).toContain("signature=REDACTED");
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
});
