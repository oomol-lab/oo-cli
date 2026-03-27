import { lstat, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../../../__tests__/helpers.ts";
import {
    createDownloadSessionRecordFixture,
    createDownloadSessionStoreSpy,
    setResponseUrl,
} from "./__tests__/helpers.ts";
import {
    createDownloadSessionKey,
    createWriteDownloadPlanFromResponse,
    loadExistingDownloadSession,
    parseContentRange,
    readResolvedFileName,
    updateDownloadSessionFromResumeResponse,
} from "./session.ts";

describe("createDownloadSessionKey", () => {
    test("normalizes missing requested values to empty strings", () => {
        expect(createDownloadSessionKey({
            outDirPath: "/tmp/downloads",
            requestUrl: "https://example.com/files/report.txt",
        })).toEqual({
            outDirPath: "/tmp/downloads",
            requestUrl: "https://example.com/files/report.txt",
            requestedExtension: "",
            requestedName: "",
        });
    });
});

describe("createWriteDownloadPlanFromResponse", () => {
    test("saves a new download session and plans a non-conflicting temporary file", async () => {
        const directoryPath = await createTemporaryDirectory("download-session-plan");
        const sessionStore = createDownloadSessionStoreSpy();

        try {
            await Bun.write(join(directoryPath, "report.txt"), "existing");
            const response = new Response("fresh", {
                headers: {
                    "Content-Disposition": "attachment; filename=\"report\"",
                    "Content-Length": "5",
                    "Content-Type": "text/plain",
                },
                status: 200,
            });
            const plan = await createWriteDownloadPlanFromResponse(
                new URL("https://example.com/files/report.txt"),
                createDownloadSessionKey({
                    outDirPath: directoryPath,
                    requestUrl: "https://example.com/files/report.txt",
                }),
                response,
                sessionStore.store,
            );

            expect(plan.kind).toBe("write-response");
            expect(plan.mode).toBe("fresh");
            expect(plan.initialBytes).toBe(0);
            expect(plan.resolvedFileName).toEqual({
                baseName: "report",
                extension: "txt",
            });
            expect(plan.tempFilePath).toBe(join(directoryPath, "report_1.oodownload"));
            expect(plan.totalBytes).toBe(5);
            expect(sessionStore.savedSessions).toHaveLength(1);
            expect(sessionStore.savedSessions[0]).toMatchObject({
                finalUrl: "https://example.com/files/report.txt",
                outDirPath: directoryPath,
                requestUrl: "https://example.com/files/report.txt",
                resolvedBaseName: "report",
                resolvedExtension: "txt",
                tempFileName: "report_1.oodownload",
                totalBytes: 5,
            });
        }
        finally {
            await rm(directoryPath, { force: true, recursive: true });
        }
    });
});

describe("loadExistingDownloadSession", () => {
    test("deletes dangling sessions when the temporary file is missing", async () => {
        const directoryPath = await createTemporaryDirectory("download-session-missing");
        const sessionStore = createDownloadSessionStoreSpy(createDownloadSessionRecordFixture({
            outDirPath: directoryPath,
            tempFileName: "report.oodownload",
        }));

        try {
            const result = await loadExistingDownloadSession(
                createDownloadSessionKey({
                    outDirPath: directoryPath,
                    requestUrl: "https://example.com/files/report.txt",
                }),
                sessionStore.store,
            );

            expect(result).toBeUndefined();
            expect(sessionStore.deletedSessionIds).toEqual([
                "0195f5fe-ec30-7000-8000-000000000011",
            ]);
        }
        finally {
            await rm(directoryPath, { force: true, recursive: true });
        }
    });

    test("deletes empty temporary files", async () => {
        const directoryPath = await createTemporaryDirectory("download-session-empty");
        const tempFilePath = join(directoryPath, "report.oodownload");
        const sessionStore = createDownloadSessionStoreSpy(createDownloadSessionRecordFixture({
            outDirPath: directoryPath,
            tempFileName: "report.oodownload",
        }));

        try {
            await Bun.write(tempFilePath, "");

            const result = await loadExistingDownloadSession(
                createDownloadSessionKey({
                    outDirPath: directoryPath,
                    requestUrl: "https://example.com/files/report.txt",
                }),
                sessionStore.store,
            );

            expect(result).toBeUndefined();
            expect(sessionStore.deletedSessionIds).toEqual([
                "0195f5fe-ec30-7000-8000-000000000011",
            ]);
            await expect(lstat(tempFilePath)).rejects.toThrow();
        }
        finally {
            await rm(directoryPath, { force: true, recursive: true });
        }
    });

    test("deletes oversized temporary files", async () => {
        const directoryPath = await createTemporaryDirectory("download-session-oversized");
        const tempFilePath = join(directoryPath, "report.oodownload");
        const sessionStore = createDownloadSessionStoreSpy(createDownloadSessionRecordFixture({
            outDirPath: directoryPath,
            tempFileName: "report.oodownload",
            totalBytes: 4,
        }));

        try {
            await Bun.write(tempFilePath, "oversized");

            const result = await loadExistingDownloadSession(
                createDownloadSessionKey({
                    outDirPath: directoryPath,
                    requestUrl: "https://example.com/files/report.txt",
                }),
                sessionStore.store,
            );

            expect(result).toBeUndefined();
            expect(sessionStore.deletedSessionIds).toEqual([
                "0195f5fe-ec30-7000-8000-000000000011",
            ]);
            await expect(lstat(tempFilePath)).rejects.toThrow();
        }
        finally {
            await rm(directoryPath, { force: true, recursive: true });
        }
    });

    test("returns the local byte count for valid partial files", async () => {
        const directoryPath = await createTemporaryDirectory("download-session-valid");
        const tempFilePath = join(directoryPath, "report.oodownload");
        const session = createDownloadSessionRecordFixture({
            outDirPath: directoryPath,
            tempFileName: "report.oodownload",
            totalBytes: 10,
        });
        const sessionStore = createDownloadSessionStoreSpy(session);

        try {
            await Bun.write(tempFilePath, "partial");

            const result = await loadExistingDownloadSession(
                createDownloadSessionKey({
                    outDirPath: directoryPath,
                    requestUrl: "https://example.com/files/report.txt",
                }),
                sessionStore.store,
            );

            expect(result).toEqual({
                localBytes: 7,
                session,
                tempFilePath,
            });
            expect(sessionStore.deletedSessionIds).toEqual([]);
        }
        finally {
            await rm(directoryPath, { force: true, recursive: true });
        }
    });
});

describe("updateDownloadSessionFromResumeResponse", () => {
    test("updates resumed metadata while preserving missing headers", () => {
        const session = createDownloadSessionRecordFixture({
            entityTag: "\"etag-1\"",
            lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
            updatedAtMs: 1_000,
        });
        const response = setResponseUrl(new Response("tail", {
            headers: {
                ETag: "\"etag-2\"",
            },
            status: 206,
        }), "https://cdn.example.com/files/report.txt");
        const updatedSession = updateDownloadSessionFromResumeResponse(
            session,
            response,
            15,
        );

        expect(updatedSession).toMatchObject({
            entityTag: "\"etag-2\"",
            finalUrl: "https://cdn.example.com/files/report.txt",
            lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
            totalBytes: 15,
        });
        expect(updatedSession.updatedAtMs).toBeGreaterThanOrEqual(1_000);
        expect(readResolvedFileName(updatedSession)).toEqual({
            baseName: "report",
            extension: "txt",
        });
    });
});

describe("parseContentRange", () => {
    test("parses valid ranges with known and wildcard totals", () => {
        expect(parseContentRange("bytes 7-14/15")).toEqual({
            end: 14,
            start: 7,
            totalBytes: 15,
        });
        expect(parseContentRange("bytes 7-14/*")).toEqual({
            end: 14,
            start: 7,
            totalBytes: undefined,
        });
    });

    test("rejects malformed ranges", () => {
        expect(parseContentRange("items 7-14/15")).toBeUndefined();
        expect(parseContentRange("bytes 14-7/15")).toBeUndefined();
        expect(parseContentRange("bytes 7-14/14")).toBeUndefined();
        expect(parseContentRange("bytes 7-/15")).toBeUndefined();
    });
});
