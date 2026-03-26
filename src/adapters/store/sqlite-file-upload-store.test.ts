import { stat } from "node:fs/promises";

import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../__tests__/helpers.ts";
import { APP_NAME } from "../../application/config/app-config.ts";
import {
    readFileUploadStatus,
    SqliteFileUploadStore,
    uploadedFilesTableName,
} from "./sqlite-file-upload-store.ts";
import { resolveStorePaths } from "./store-path.ts";

describe("SqliteFileUploadStore", () => {
    test("persists and lists uploaded file records in reverse upload order", async () => {
        const root = await createTemporaryDirectory("sqlite-file-upload-store");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const store = new SqliteFileUploadStore(storePaths.uploadsFilePath);

        try {
            store.save({
                downloadUrl: "https://example.com/files/first",
                expiresAtMs: 2_000,
                fileName: "first.txt",
                fileSize: 16,
                id: "0195f5fe-ec20-7000-8000-000000000001",
                uploadedAtMs: 1_000,
            });
            store.save({
                downloadUrl: "https://example.com/files/second",
                expiresAtMs: 3_000,
                fileName: "second.txt",
                fileSize: 32,
                id: "0195f5fe-ec21-7000-8000-000000000002",
                uploadedAtMs: 1_500,
            });

            await expect(stat(store.getFilePath())).resolves.toMatchObject({
                isFile: expect.any(Function),
            });
            expect(store.list({ now: 1_200 })).toEqual([
                {
                    downloadUrl: "https://example.com/files/second",
                    expiresAtMs: 3_000,
                    fileName: "second.txt",
                    fileSize: 32,
                    id: "0195f5fe-ec21-7000-8000-000000000002",
                    uploadedAtMs: 1_500,
                },
                {
                    downloadUrl: "https://example.com/files/first",
                    expiresAtMs: 2_000,
                    fileName: "first.txt",
                    fileSize: 16,
                    id: "0195f5fe-ec20-7000-8000-000000000001",
                    uploadedAtMs: 1_000,
                },
            ]);
        }
        finally {
            store.close();
        }
    });

    test("filters records by status and limit without deleting expired rows", async () => {
        const root = await createTemporaryDirectory("sqlite-file-upload-list");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const store = new SqliteFileUploadStore(storePaths.uploadsFilePath);

        try {
            store.save({
                downloadUrl: "https://example.com/files/expired",
                expiresAtMs: 1_000,
                fileName: "expired.txt",
                fileSize: 10,
                id: "0195f5fe-ec22-7000-8000-000000000003",
                uploadedAtMs: 500,
            });
            store.save({
                downloadUrl: "https://example.com/files/active",
                expiresAtMs: 4_000,
                fileName: "active.txt",
                fileSize: 12,
                id: "0195f5fe-ec23-7000-8000-000000000004",
                uploadedAtMs: 1_500,
            });
            store.save({
                downloadUrl: "https://example.com/files/active-latest",
                expiresAtMs: 5_000,
                fileName: "active-latest.txt",
                fileSize: 14,
                id: "0195f5fe-ec24-7000-8000-000000000005",
                uploadedAtMs: 2_000,
            });

            expect(
                store.list({
                    limit: 1,
                    now: 2_500,
                    status: "active",
                }),
            ).toEqual([
                {
                    downloadUrl: "https://example.com/files/active-latest",
                    expiresAtMs: 5_000,
                    fileName: "active-latest.txt",
                    fileSize: 14,
                    id: "0195f5fe-ec24-7000-8000-000000000005",
                    uploadedAtMs: 2_000,
                },
            ]);
            expect(
                store.list({
                    now: 2_500,
                    status: "expired",
                }),
            ).toEqual([
                {
                    downloadUrl: "https://example.com/files/expired",
                    expiresAtMs: 1_000,
                    fileName: "expired.txt",
                    fileSize: 10,
                    id: "0195f5fe-ec22-7000-8000-000000000003",
                    uploadedAtMs: 500,
                },
            ]);

            const database = new Database(store.getFilePath(), {
                strict: true,
            });

            try {
                expect(
                    database.query(
                        `SELECT COUNT(*) AS count FROM ${uploadedFilesTableName}`,
                    ).get() as {
                        count: number;
                    },
                ).toEqual({
                    count: 3,
                });
            }
            finally {
                database.close();
            }
        }
        finally {
            store.close();
        }
    });

    test("deletes expired rows and keeps active rows", async () => {
        const root = await createTemporaryDirectory("sqlite-file-upload-cleanup");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const store = new SqliteFileUploadStore(storePaths.uploadsFilePath);

        try {
            store.save({
                downloadUrl: "https://example.com/files/old",
                expiresAtMs: 1_000,
                fileName: "old.txt",
                fileSize: 10,
                id: "0195f5fe-ec25-7000-8000-000000000006",
                uploadedAtMs: 500,
            });
            store.save({
                downloadUrl: "https://example.com/files/new",
                expiresAtMs: 3_000,
                fileName: "new.txt",
                fileSize: 10,
                id: "0195f5fe-ec26-7000-8000-000000000007",
                uploadedAtMs: 2_000,
            });

            expect(store.deleteExpired(2_000)).toBe(1);
            expect(store.list({ now: 2_000 })).toEqual([
                {
                    downloadUrl: "https://example.com/files/new",
                    expiresAtMs: 3_000,
                    fileName: "new.txt",
                    fileSize: 10,
                    id: "0195f5fe-ec26-7000-8000-000000000007",
                    uploadedAtMs: 2_000,
                },
            ]);
        }
        finally {
            store.close();
        }
    });
});

describe("readFileUploadStatus", () => {
    test("marks records as expired when the expiry time has passed", () => {
        expect(readFileUploadStatus(1_000, 1_000)).toBe("expired");
        expect(readFileUploadStatus(1_001, 1_000)).toBe("active");
    });
});
