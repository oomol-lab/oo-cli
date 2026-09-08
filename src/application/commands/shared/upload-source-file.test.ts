import { mkdir, truncate } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

import {
    createTemporaryDirectory,
    expectCliUserError,
    useTemporaryDirectoryCleanup,
} from "../../../../__tests__/helpers.ts";
import { readUploadSourceFile } from "./upload-source-file.ts";

const errorKeys = {
    pathNotFile: "errors.fileUpload.pathNotFile",
    readFailed: "errors.fileUpload.readFailed",
    tooLarge: "errors.fileUpload.tooLarge",
} as const;

describe("readUploadSourceFile", () => {
    const temporaryDirectories = useTemporaryDirectoryCleanup();

    test("resolves a relative path against cwd and reports the file", async () => {
        const cwd = await createTemporaryDirectory("upload-source");
        temporaryDirectories.track(cwd);
        await Bun.write(join(cwd, "site.html"), "<p>hi</p>");

        const sourceFile = await readUploadSourceFile("site.html", cwd, {
            errorKeys,
            maxSizeBytes: 1024,
            recordTelemetryProperties: undefined,
        });

        expect(sourceFile.fileName).toBe("site.html");
        expect(sourceFile.fileSize).toBe(9);
        await expect(sourceFile.file.text()).resolves.toBe("<p>hi</p>");
    });

    test("reports a missing file with the caller's read error key", async () => {
        const cwd = await createTemporaryDirectory("upload-source");
        temporaryDirectories.track(cwd);

        const error = await expectCliUserError(
            readUploadSourceFile("missing.html", cwd, {
                errorKeys,
                maxSizeBytes: 1024,
                recordTelemetryProperties: undefined,
            }),
        );

        expect(error).toMatchObject({
            exitCode: 1,
            key: "errors.fileUpload.readFailed",
            params: { path: join(cwd, "missing.html") },
        });
    });

    test("rejects directories with the caller's not-a-file key", async () => {
        const cwd = await createTemporaryDirectory("upload-source");
        temporaryDirectories.track(cwd);
        await mkdir(join(cwd, "site"));

        const error = await expectCliUserError(
            readUploadSourceFile("site", cwd, {
                errorKeys,
                maxSizeBytes: 1024,
                recordTelemetryProperties: undefined,
            }),
        );

        expect(error).toMatchObject({
            exitCode: 1,
            key: "errors.fileUpload.pathNotFile",
            params: { path: join(cwd, "site") },
        });
    });

    test("rejects oversize files and records the bucketed size first", async () => {
        const cwd = await createTemporaryDirectory("upload-source");
        temporaryDirectories.track(cwd);
        const filePath = join(cwd, "large.html");
        const recorded: Record<string, unknown>[] = [];
        await Bun.write(filePath, "");
        await truncate(filePath, 2048);

        const error = await expectCliUserError(
            readUploadSourceFile(filePath, cwd, {
                errorKeys,
                maxSizeBytes: 1024,
                recordTelemetryProperties: (properties) => {
                    recorded.push(properties);
                },
            }),
        );

        expect(error).toMatchObject({
            exitCode: 2,
            key: "errors.fileUpload.tooLarge",
            params: { max: 1024, path: filePath, size: 2048 },
        });
        expect(recorded).toEqual([
            { bytes_total_bucket: "<1MB", rejected_too_large: true },
        ]);
    });
});
