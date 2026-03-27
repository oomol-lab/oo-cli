import { lstat, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createTemporaryDirectory,
    createTextBuffer,
} from "../../../../../__tests__/helpers.ts";
import {
    createDownloadSessionRecordFixture,
    createDownloadSessionStoreSpy,
    expectCliUserError,
} from "./__tests__/helpers.ts";
import {
    deleteDownloadSessionArtifacts,
    finalizeDownloadedFile,
    openTemporaryDownloadFile,
    resolveAvailableFileName,
    resolveTemporaryDownloadFileName,
    writeDownloadToTemporaryFile,
} from "./file-system.ts";
import { createDownloadProgressReporter } from "./progress.ts";

describe("resolveAvailableFileName", () => {
    test("appends a numeric suffix when the target name already exists", async () => {
        const directoryPath = await createTemporaryDirectory("download-file-name");

        try {
            await Bun.write(join(directoryPath, "report.txt"), "existing");
            await Bun.write(join(directoryPath, "report_1.txt"), "existing");

            const fileName = await resolveAvailableFileName(
                directoryPath,
                "report",
                "txt",
            );

            expect(fileName).toBe("report_2.txt");
        }
        finally {
            await rm(directoryPath, { force: true, recursive: true });
        }
    });
});

describe("resolveTemporaryDownloadFileName", () => {
    test("skips reserved and existing temporary file names", async () => {
        const directoryPath = await createTemporaryDirectory("download-temp-name");

        try {
            await Bun.write(join(directoryPath, "report.oodownload"), "existing");

            const fileName = await resolveTemporaryDownloadFileName(
                directoryPath,
                "report",
                [
                    "report_1.oodownload",
                ],
            );

            expect(fileName).toBe("report_2.oodownload");
        }
        finally {
            await rm(directoryPath, { force: true, recursive: true });
        }
    });
});

describe("deleteDownloadSessionArtifacts", () => {
    test("removes the temporary file and deletes the stored session", async () => {
        const directoryPath = await createTemporaryDirectory("download-delete-artifacts");
        const tempFilePath = join(directoryPath, "report.oodownload");
        const sessionStore = createDownloadSessionStoreSpy();

        try {
            await Bun.write(tempFilePath, "partial");

            await deleteDownloadSessionArtifacts(
                {
                    localBytes: 7,
                    session: createDownloadSessionRecordFixture({
                        id: "session-1",
                        outDirPath: directoryPath,
                        tempFileName: "report.oodownload",
                    }),
                    tempFilePath,
                },
                sessionStore.store,
            );

            expect(sessionStore.deletedSessionIds).toEqual([
                "session-1",
            ]);
            await expect(lstat(tempFilePath)).rejects.toThrow();
        }
        finally {
            await rm(directoryPath, { force: true, recursive: true });
        }
    });
});

describe("openTemporaryDownloadFile", () => {
    test("fails when the partial file size changes before append resumes", async () => {
        const directoryPath = await createTemporaryDirectory("download-open-append");
        const tempFilePath = join(directoryPath, "report.oodownload");

        try {
            await Bun.write(tempFilePath, "abc");

            const error = await expectCliUserError(openTemporaryDownloadFile(
                tempFilePath,
                "append",
                2,
            ));

            expect(error.key).toBe("errors.fileDownload.downloadFailed");
            expect(error.params).toEqual({
                message: "The partial download changed before resume could continue.",
                path: tempFilePath,
            });
        }
        finally {
            await rm(directoryPath, { force: true, recursive: true });
        }
    });
});

describe("writeDownloadToTemporaryFile", () => {
    test("writes streamed content and reports completion", async () => {
        const directoryPath = await createTemporaryDirectory("download-write-success");
        const tempFilePath = join(directoryPath, "report.oodownload");
        const stderr = createTextBuffer({
            isTTY: true,
        });

        try {
            const fileHandle = await openTemporaryDownloadFile(
                tempFilePath,
                "fresh",
                0,
            );
            const reporter = createDownloadProgressReporter(stderr.writer, 4);

            const writtenBytes = await writeDownloadToTemporaryFile(
                new Response(new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(new TextEncoder().encode("ab"));
                        controller.enqueue(new TextEncoder().encode("cd"));
                        controller.close();
                    },
                })),
                fileHandle,
                tempFilePath,
                reporter,
                0,
            );

            expect(writtenBytes).toBe(4);
            await expect(Bun.file(tempFilePath).text()).resolves.toBe("abcd");
            expect(stderr.read()).toContain("Downloaded 4 B / 4 B (100%)");
        }
        finally {
            await rm(directoryPath, { force: true, recursive: true });
        }
    });

    test("reports partial progress before surfacing stream errors", async () => {
        const directoryPath = await createTemporaryDirectory("download-write-error");
        const tempFilePath = join(directoryPath, "report.oodownload");
        const stderr = createTextBuffer({
            isTTY: true,
        });

        try {
            const fileHandle = await openTemporaryDownloadFile(
                tempFilePath,
                "fresh",
                0,
            );
            const reporter = createDownloadProgressReporter(stderr.writer, 4);
            const error = await expectCliUserError(writeDownloadToTemporaryFile(
                new Response(new ReadableStream<Uint8Array>({
                    pull: (() => {
                        let emittedChunk = false;

                        return (controller: ReadableStreamDefaultController<Uint8Array>) => {
                            if (!emittedChunk) {
                                emittedChunk = true;
                                controller.enqueue(new TextEncoder().encode("ab"));
                                return;
                            }

                            controller.error(new Error("Connection dropped."));
                        };
                    })(),
                })),
                fileHandle,
                tempFilePath,
                reporter,
                0,
            ));

            expect(error.key).toBe("errors.fileDownload.downloadFailed");
            expect(error.params).toEqual({
                message: "Connection dropped.",
                path: tempFilePath,
            });
            await expect(Bun.file(tempFilePath).text()).resolves.toBe("ab");
            expect(stderr.read()).toContain("Downloading");
        }
        finally {
            await rm(directoryPath, { force: true, recursive: true });
        }
    });
});

describe("finalizeDownloadedFile", () => {
    test("moves the temporary file to the next available target name", async () => {
        const directoryPath = await createTemporaryDirectory("download-finalize");
        const tempFilePath = join(directoryPath, "report.oodownload");

        try {
            await Bun.write(join(directoryPath, "report.txt"), "existing");
            await Bun.write(tempFilePath, "fresh");

            const finalPath = await finalizeDownloadedFile(
                tempFilePath,
                directoryPath,
                "report",
                "txt",
            );

            expect(finalPath).toBe(join(directoryPath, "report_1.txt"));
            await expect(Bun.file(finalPath).text()).resolves.toBe("fresh");
            await expect(lstat(tempFilePath)).rejects.toThrow();
        }
        finally {
            await rm(directoryPath, { force: true, recursive: true });
        }
    });
});
