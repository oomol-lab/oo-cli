import type {
    FileDownloadSessionKey,
    FileDownloadSessionRecord,
} from "../../application/contracts/file-download-session-store.ts";

import { lstat, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../__tests__/helpers.ts";
import { SidecarFileDownloadSessionStore } from "./sidecar-file-download-session-store.ts";

describe("SidecarFileDownloadSessionStore", () => {
    test("persists download sessions as sidecar json files ordered by recency", async () => {
        const root = await createTemporaryDirectory("sidecar-download-session-store");
        const sessionsDirectory = join(root, "sessions");
        const outputDirectory = join(root, "downloads");
        const key = createDownloadSessionKeyFixture(outputDirectory);
        const store = new SidecarFileDownloadSessionStore(sessionsDirectory);

        try {
            await Bun.write(join(outputDirectory, "old.oodownload"), "old");
            await Bun.write(join(outputDirectory, "new.oodownload"), "new");
            await store.saveDownloadSession(createDownloadSessionRecordFixture({
                id: "0195f5fe-ec30-7000-8000-000000000011",
                outDirPath: outputDirectory,
                tempFileName: "old.oodownload",
                updatedAtMs: 1_000,
            }));
            await store.saveDownloadSession(createDownloadSessionRecordFixture({
                id: "0195f5fe-ec31-7000-8000-000000000012",
                outDirPath: outputDirectory,
                tempFileName: "new.oodownload",
                updatedAtMs: 2_000,
            }));

            const sessions = await store.findDownloadSessions(key);

            expect(sessions.map(session => session.tempFileName)).toEqual([
                "new.oodownload",
                "old.oodownload",
            ]);
            expect((await store.findDownloadSession(key))?.tempFileName).toBe("new.oodownload");
            expect(
                await store.deleteDownloadSession("0195f5fe-ec31-7000-8000-000000000012"),
            ).toBeTrue();
            expect((await store.findDownloadSession(key))?.tempFileName).toBe("old.oodownload");
        }
        finally {
            store.close();
            await rm(root, { force: true, recursive: true });
        }
    });

    test("deletes stale sidecars and temporary artifacts that are not actively locked", async () => {
        const root = await createTemporaryDirectory("sidecar-download-session-cleanup");
        const sessionsDirectory = join(root, "sessions");
        const outputDirectory = join(root, "downloads");
        const staleTempFilePath = join(outputDirectory, "stale.oodownload");
        const activeTempFilePath = join(outputDirectory, "active.oodownload");
        const store = new SidecarFileDownloadSessionStore(sessionsDirectory);

        try {
            await Bun.write(staleTempFilePath, "stale");
            await Bun.write(activeTempFilePath, "active");
            await Bun.write(`${activeTempFilePath}.lock`, `${JSON.stringify({
                acquiredAt: new Date(0).toISOString(),
                execPath: process.execPath,
                pid: process.pid,
                sessionId: "active-session",
                tempFileName: "active.oodownload",
            })}\n`);
            await store.saveDownloadSession(createDownloadSessionRecordFixture({
                id: "0195f5fe-ec30-7000-8000-000000000011",
                outDirPath: outputDirectory,
                tempFileName: "stale.oodownload",
                updatedAtMs: 1_000,
            }));
            await store.saveDownloadSession(createDownloadSessionRecordFixture({
                id: "0195f5fe-ec31-7000-8000-000000000012",
                outDirPath: outputDirectory,
                tempFileName: "active.oodownload",
                updatedAtMs: 1_000,
            }));

            expect(await store.deleteDownloadSessionsUpdatedBefore(2_000)).toBe(1);
            await expect(lstat(staleTempFilePath)).rejects.toThrow();
            await expect(Bun.file(activeTempFilePath).text()).resolves.toBe("active");
            expect((await store.findDownloadSessions(createDownloadSessionKeyFixture(outputDirectory)))
                .map(session => session.tempFileName)).toEqual([
                "active.oodownload",
            ]);
        }
        finally {
            store.close();
            await rm(root, { force: true, recursive: true });
        }
    });

    test("keeps stale sidecars discoverable when artifact cleanup fails", async () => {
        const root = await createTemporaryDirectory("sidecar-download-session-cleanup-failure");
        const sessionsDirectory = join(root, "sessions");
        const outputDirectory = join(root, "downloads");
        const tempFilePath = join(outputDirectory, "stale.oodownload");
        const sessionId = "0195f5fe-ec30-7000-8000-000000000011";
        const store = new SidecarFileDownloadSessionStore(sessionsDirectory);

        try {
            await mkdir(tempFilePath, { recursive: true });
            await store.saveDownloadSession(createDownloadSessionRecordFixture({
                id: sessionId,
                outDirPath: outputDirectory,
                tempFileName: "stale.oodownload",
                updatedAtMs: 1_000,
            }));

            expect(await store.deleteDownloadSessionsUpdatedBefore(2_000)).toBe(0);
            expect((await lstat(join(sessionsDirectory, `${sessionId}.json`))).isFile())
                .toBeTrue();
        }
        finally {
            store.close();
            await rm(root, { force: true, recursive: true });
        }
    });

    test("ignores sidecar records whose temporary files are missing", async () => {
        const root = await createTemporaryDirectory("sidecar-download-session-missing");
        const sessionsDirectory = join(root, "sessions");
        const outputDirectory = join(root, "downloads");
        const key = createDownloadSessionKeyFixture(outputDirectory);
        const store = new SidecarFileDownloadSessionStore(sessionsDirectory);

        try {
            await store.saveDownloadSession(createDownloadSessionRecordFixture({
                outDirPath: outputDirectory,
                tempFileName: "missing.oodownload",
            }));

            expect(await store.findDownloadSessions(key)).toEqual([]);
        }
        finally {
            store.close();
            await rm(root, { force: true, recursive: true });
        }
    });

    test("ignores malformed sidecar records", async () => {
        const root = await createTemporaryDirectory("sidecar-download-session-malformed");
        const sessionsDirectory = join(root, "sessions");
        const outputDirectory = join(root, "downloads");
        const key = createDownloadSessionKeyFixture(outputDirectory);
        const record = createDownloadSessionRecordFixture({
            outDirPath: outputDirectory,
            tempFileName: "report.oodownload",
        });
        const store = new SidecarFileDownloadSessionStore(sessionsDirectory);

        try {
            await Bun.write(join(outputDirectory, record.tempFileName), "partial");
            await store.saveDownloadSession(record);
            await Bun.write(join(sessionsDirectory, `${record.id}.json`), "{");

            expect(await store.findDownloadSessions(key)).toEqual([]);
        }
        finally {
            store.close();
            await rm(root, { force: true, recursive: true });
        }
    });

    test("keeps downloads running when a sidecar cannot be persisted", async () => {
        const root = await createTemporaryDirectory("sidecar-download-session-write-failure");
        const sessionsDirectory = join(root, "sessions");
        const outputDirectory = join(root, "downloads");
        const key = createDownloadSessionKeyFixture(outputDirectory);
        const record = createDownloadSessionRecordFixture({
            outDirPath: outputDirectory,
            tempFileName: "report.oodownload",
        });
        const store = new SidecarFileDownloadSessionStore(sessionsDirectory);

        try {
            await Bun.write(join(outputDirectory, record.tempFileName), "partial");
            await mkdir(join(sessionsDirectory, `${record.id}.json`), { recursive: true });

            await expect(store.saveDownloadSession(record)).resolves.toBeUndefined();
            expect(await store.findDownloadSessions(key)).toEqual([]);
        }
        finally {
            store.close();
            await rm(root, { force: true, recursive: true });
        }
    });

    test("rejects unsafe session ids before resolving sidecar paths", async () => {
        const root = await createTemporaryDirectory("sidecar-download-session-unsafe-id");
        const sessionsDirectory = join(root, "sessions");
        const store = new SidecarFileDownloadSessionStore(sessionsDirectory);

        try {
            await expect(store.saveDownloadSession(createDownloadSessionRecordFixture({
                id: "../outside",
            }))).rejects.toThrow("Download session id is invalid.");
            await expect(store.deleteDownloadSession("../outside"))
                .rejects
                .toThrow("Download session id is invalid.");
        }
        finally {
            store.close();
            await rm(root, { force: true, recursive: true });
        }
    });
});

function createDownloadSessionKeyFixture(
    outputDirectory: string,
): FileDownloadSessionKey {
    return {
        outDirPath: outputDirectory,
        requestUrl: "https://example.com/files/report.txt",
        requestedExtension: "",
        requestedName: "",
    };
}

function createDownloadSessionRecordFixture(
    overrides: Partial<FileDownloadSessionRecord> = {},
): FileDownloadSessionRecord {
    return {
        entityTag: "\"etag-1\"",
        finalUrl: "https://example.com/files/report.txt",
        id: "0195f5fe-ec30-7000-8000-000000000011",
        lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
        outDirPath: "/tmp/downloads",
        requestUrl: "https://example.com/files/report.txt",
        requestedExtension: "",
        requestedName: "",
        resolvedBaseName: "report",
        resolvedExtension: "txt",
        tempFileName: "report.oodownload",
        totalBytes: 10,
        updatedAtMs: 1_000,
        ...overrides,
    };
}
