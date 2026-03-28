import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import { createCliSandbox, createCliSnapshot } from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";

describe("file list and cleanup CLI", () => {
    test("supports file list filters and cleanup json output", async () => {
        const sandbox = await createCliSandbox();
        const uploadsFilePath = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        }).uploadsFilePath;

        try {
            await mkdir(
                join(
                    sandbox.env.XDG_CONFIG_HOME!,
                    APP_NAME,
                    "data",
                ),
                {
                    recursive: true,
                },
            );

            const database = new Database(uploadsFilePath, {
                create: true,
                strict: true,
            });

            try {
                database.run(
                    [
                        "CREATE TABLE uploaded_files (",
                        "id TEXT PRIMARY KEY NOT NULL,",
                        "file_name TEXT NOT NULL,",
                        "file_size INTEGER NOT NULL,",
                        "download_url TEXT NOT NULL,",
                        "uploaded_at_ms INTEGER NOT NULL,",
                        "expires_at_ms INTEGER NOT NULL",
                        ") STRICT",
                    ].join(" "),
                );
                database.run(
                    [
                        "INSERT INTO uploaded_files (",
                        "id, file_name, file_size, download_url, uploaded_at_ms, expires_at_ms",
                        ") VALUES",
                        "('0195f5fe-ec27-7000-8000-000000000008', 'expired.txt', 10, 'https://download.example.com/expired', 1000, 2000),",
                        "('0195f5fe-ec28-7000-8000-000000000009', 'active.txt', 11, 'https://download.example.com/active', 3000, 32503680000000)",
                    ].join(" "),
                );
            }
            finally {
                database.close();
            }

            const listTextResult = await sandbox.run(
                ["file", "list", "--status=active", "--limit=1"],
            );
            const listJsonResult = await sandbox.run(
                ["file", "list", "--status=expired", "--json"],
            );
            const cleanupResult = await sandbox.run(
                ["file", "cleanup", "--json"],
            );
            const listAfterCleanup = await sandbox.run(
                ["file", "list", "--json"],
            );

            expect(listTextResult.exitCode).toBe(0);
            expect(createCliSnapshot(listTextResult)).toMatchSnapshot();

            expect(listJsonResult.exitCode).toBe(0);
            expect(JSON.parse(listJsonResult.stdout)).toEqual([
                {
                    downloadUrl: "https://download.example.com/expired",
                    expiresAt: new Date(2000).toISOString(),
                    fileName: "expired.txt",
                    fileSize: 10,
                    id: "0195f5fe-ec27-7000-8000-000000000008",
                    status: "expired",
                    uploadedAt: new Date(1000).toISOString(),
                },
            ]);

            expect(cleanupResult.exitCode).toBe(0);
            expect(JSON.parse(cleanupResult.stdout)).toEqual({
                deletedCount: 1,
            });
            expect(listAfterCleanup.exitCode).toBe(0);
            expect(JSON.parse(listAfterCleanup.stdout)).toEqual([
                {
                    downloadUrl: "https://download.example.com/active",
                    expiresAt: new Date(32503680000000).toISOString(),
                    fileName: "active.txt",
                    fileSize: 11,
                    id: "0195f5fe-ec28-7000-8000-000000000009",
                    status: "active",
                    uploadedAt: new Date(3000).toISOString(),
                },
            ]);
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
