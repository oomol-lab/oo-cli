import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../__tests__/helpers.ts";
import { APP_NAME } from "../../application/config/app-config.ts";
import {
    downloadResumeSessionsTableName,
    SqliteFileDownloadSessionStore,
} from "./sqlite-file-download-session-store.ts";
import { resolveStorePaths } from "./store-path.ts";

describe("SqliteFileDownloadSessionStore", () => {
    test("persists and deletes download resume sessions by request key", async () => {
        const root = await createTemporaryDirectory("sqlite-download-session-store");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const store = new SqliteFileDownloadSessionStore(
            storePaths.downloadSessionsFilePath,
        );

        try {
            store.saveDownloadSession({
                entityTag: "\"etag-1\"",
                finalUrl: "https://cdn.example.com/file.txt",
                id: "0195f5fe-ec27-7000-8000-000000000008",
                lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
                outDirPath: "/tmp/downloads",
                requestUrl: "https://example.com/file.txt",
                requestedExtension: "",
                requestedName: "",
                resolvedBaseName: "file",
                resolvedExtension: "txt",
                tempFileName: ".oo-download-1.oodownload",
                totalBytes: 128,
                updatedAtMs: 1_000,
            });

            expect(store.findDownloadSession({
                outDirPath: "/tmp/downloads",
                requestUrl: "https://example.com/file.txt",
                requestedExtension: "",
                requestedName: "",
            })).toEqual({
                entityTag: "\"etag-1\"",
                finalUrl: "https://cdn.example.com/file.txt",
                id: "0195f5fe-ec27-7000-8000-000000000008",
                lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
                outDirPath: "/tmp/downloads",
                requestUrl: "https://example.com/file.txt",
                requestedExtension: "",
                requestedName: "",
                resolvedBaseName: "file",
                resolvedExtension: "txt",
                tempFileName: ".oo-download-1.oodownload",
                totalBytes: 128,
                updatedAtMs: 1_000,
            });
            expect(
                store.deleteDownloadSession(
                    "0195f5fe-ec27-7000-8000-000000000008",
                ),
            ).toBeTrue();
            expect(store.findDownloadSession({
                outDirPath: "/tmp/downloads",
                requestUrl: "https://example.com/file.txt",
                requestedExtension: "",
                requestedName: "",
            })).toBeUndefined();

            const database = new Database(store.getFilePath(), {
                strict: true,
            });

            try {
                expect(
                    database.query(
                        `SELECT COUNT(*) AS count FROM ${downloadResumeSessionsTableName}`,
                    ).get() as {
                        count: number;
                    },
                ).toEqual({
                    count: 0,
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

    test("deletes only download resume sessions older than the cutoff", async () => {
        const root = await createTemporaryDirectory("sqlite-download-session-cleanup");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: {
                HOME: root,
                XDG_CONFIG_HOME: root,
            },
            platform: "linux",
        });
        const store = new SqliteFileDownloadSessionStore(
            storePaths.downloadSessionsFilePath,
        );

        try {
            store.saveDownloadSession({
                entityTag: "\"etag-old\"",
                finalUrl: "https://cdn.example.com/old.txt",
                id: "0195f5fe-ec28-7000-8000-000000000009",
                lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
                outDirPath: "/tmp/downloads",
                requestUrl: "https://example.com/old.txt",
                requestedExtension: "",
                requestedName: "",
                resolvedBaseName: "old",
                resolvedExtension: "txt",
                tempFileName: "old.oodownload",
                totalBytes: 64,
                updatedAtMs: 1_000,
            });
            store.saveDownloadSession({
                entityTag: "\"etag-new\"",
                finalUrl: "https://cdn.example.com/new.txt",
                id: "0195f5fe-ec29-7000-8000-000000000010",
                lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
                outDirPath: "/tmp/downloads",
                requestUrl: "https://example.com/new.txt",
                requestedExtension: "",
                requestedName: "",
                resolvedBaseName: "new",
                resolvedExtension: "txt",
                tempFileName: "new.oodownload",
                totalBytes: 64,
                updatedAtMs: 2_000,
            });

            expect(store.deleteDownloadSessionsUpdatedBefore(2_000)).toBe(1);
            expect(store.findDownloadSession({
                outDirPath: "/tmp/downloads",
                requestUrl: "https://example.com/old.txt",
                requestedExtension: "",
                requestedName: "",
            })).toBeUndefined();
            expect(store.findDownloadSession({
                outDirPath: "/tmp/downloads",
                requestUrl: "https://example.com/new.txt",
                requestedExtension: "",
                requestedName: "",
            })).toEqual(expect.objectContaining({
                id: "0195f5fe-ec29-7000-8000-000000000010",
            }));
        }
        finally {
            store.close();
        }
    });
});
