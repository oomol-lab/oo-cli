import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    countDownloadSidecarSessions,
    createCliSandbox,
    createCliSnapshot,
} from "../../../../__tests__/helpers.ts";
import { SidecarFileDownloadSessionStore } from "../../../adapters/store/sidecar-file-download-session-store.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";

describe("file download resume CLI", () => {
    test("preserves the temporary file and resume session when file download fails mid-download", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "downloads");
        const downloadSessionsDirectoryPath = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        }).downloadSessionsDirectoryPath;

        try {
            await mkdir(outputDirectoryPath, { recursive: true });

            const result = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/broken.txt",
                    outputDirectoryPath,
                ],
                {
                    fetcher: async () => {
                        let emittedChunk = false;
                        const body = new ReadableStream<Uint8Array>({
                            pull(controller) {
                                if (!emittedChunk) {
                                    emittedChunk = true;
                                    controller.enqueue(new TextEncoder().encode("partial"));
                                    return;
                                }

                                controller.error(new Error("Connection dropped."));
                            },
                        });
                        const response = new Response(body, {
                            headers: {
                                "Content-Disposition": "attachment; filename=\"broken.txt\"",
                            },
                            status: 200,
                        });

                        Object.defineProperty(response, "url", {
                            value: "https://example.com/broken.txt",
                        });

                        return response;
                    },
                    stderr: {
                        isTTY: true,
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(createCliSnapshot(result, {
                sandbox,
                stripAnsi: true,
            }).stderr).toContain(
                "Failed to download the file at <HOME>/downloads/broken.",
            );
            const outputEntries = await readdir(outputDirectoryPath);

            expect(outputEntries).toHaveLength(1);
            expect(outputEntries[0]?.startsWith("broken.")).toBeTrue();
            expect(outputEntries[0]?.endsWith(".oodownload")).toBeTrue();
            expect(await countDownloadSidecarSessions(downloadSessionsDirectoryPath)).toBe(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("cleans up download resume sessions older than 14 days when file cleanup runs", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "downloads");
        const downloadSessionsDirectoryPath = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        }).downloadSessionsDirectoryPath;
        const sessionStore = new SidecarFileDownloadSessionStore(
            downloadSessionsDirectoryPath,
        );

        try {
            await mkdir(outputDirectoryPath, { recursive: true });
            await sessionStore.saveDownloadSession({
                entityTag: "\"stale-1\"",
                finalUrl: "https://cdn.example.com/stale.txt",
                id: "0195f5fe-ec30-7000-8000-000000000011",
                lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
                outDirPath: outputDirectoryPath,
                requestUrl: "https://example.com/stale.txt",
                requestedExtension: "",
                requestedName: "",
                resolvedBaseName: "stale",
                resolvedExtension: "txt",
                tempFileName: "stale.oodownload",
                totalBytes: 64,
                updatedAtMs: Date.now() - (15 * 24 * 60 * 60 * 1000),
            });
            await Bun.write(join(outputDirectoryPath, "stale.oodownload"), "stale");

            const result = await sandbox.run(
                [
                    "file",
                    "cleanup",
                    "--json",
                ],
            );

            expect(result.exitCode).toBe(0);
            expect(JSON.parse(result.stdout)).toEqual({
                deletedCount: 1,
            });
            expect(await countDownloadSidecarSessions(downloadSessionsDirectoryPath)).toBe(0);
        }
        finally {
            sessionStore.close();
            await sandbox.cleanup();
        }
    });

    test("resumes file download with HTTP Range after a mid-download failure", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "downloads");
        const downloadSessionsDirectoryPath = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        }).downloadSessionsDirectoryPath;
        let requestCount = 0;

        try {
            await mkdir(outputDirectoryPath, { recursive: true });

            const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
                requestCount += 1;
                const headers = new Headers(init?.headers);

                if (requestCount === 1) {
                    expect(headers.get("Range")).toBeNull();

                    let emittedChunk = false;
                    const body = new ReadableStream<Uint8Array>({
                        pull(controller) {
                            if (!emittedChunk) {
                                emittedChunk = true;
                                controller.enqueue(new TextEncoder().encode("partial"));
                                return;
                            }

                            controller.error(new Error("Connection dropped."));
                        },
                    });
                    const response = new Response(body, {
                        headers: {
                            "Content-Disposition": "attachment; filename=\"broken.txt\"",
                            "Content-Length": "15",
                            "ETag": "\"resume-1\"",
                            "Last-Modified": "Wed, 01 Jan 2025 00:00:00 GMT",
                        },
                        status: 200,
                    });

                    Object.defineProperty(response, "url", {
                        value: "https://example.com/broken.txt",
                    });

                    return response;
                }

                expect(headers.get("Range")).toBe("bytes=7-");
                expect(headers.get("If-Range")).toBe("\"resume-1\"");

                const response = new Response("-payload", {
                    headers: {
                        "Content-Length": "8",
                        "Content-Range": "bytes 7-14/15",
                        "ETag": "\"resume-1\"",
                        "Last-Modified": "Wed, 01 Jan 2025 00:00:00 GMT",
                    },
                    status: 206,
                });

                Object.defineProperty(response, "url", {
                    value: "https://example.com/broken.txt",
                });

                return response;
            };

            const firstResult = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/broken.txt",
                    outputDirectoryPath,
                ],
                {
                    fetcher,
                },
            );
            const secondResult = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/broken.txt",
                    outputDirectoryPath,
                ],
                {
                    fetcher,
                },
            );
            const downloadedFilePath = join(outputDirectoryPath, "broken.txt");

            expect(firstResult.exitCode).toBe(1);
            expect(secondResult.exitCode).toBe(0);
            expect(createCliSnapshot(firstResult, { sandbox }).stderr).toContain(
                "Failed to download the file at <HOME>/downloads/broken.",
            );
            expect(createCliSnapshot(secondResult, { sandbox })).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: "Saved to: <HOME>/downloads/broken.txt\n",
            });
            expect(requestCount).toBe(2);
            await expect(Bun.file(downloadedFilePath).text()).resolves.toBe("partial-payload");
            expect(await readdir(outputDirectoryPath)).toEqual([
                "broken.txt",
            ]);
            expect(await countDownloadSidecarSessions(downloadSessionsDirectoryPath)).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("restarts file download from the beginning when the server ignores Range", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "downloads");
        const downloadSessionsDirectoryPath = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        }).downloadSessionsDirectoryPath;
        let requestCount = 0;

        try {
            await mkdir(outputDirectoryPath, { recursive: true });

            const fetcher = async (_input: string | URL | Request, init?: RequestInit) => {
                requestCount += 1;
                const headers = new Headers(init?.headers);

                if (requestCount === 1) {
                    expect(headers.get("Range")).toBeNull();

                    let emittedChunk = false;
                    const body = new ReadableStream<Uint8Array>({
                        pull(controller) {
                            if (!emittedChunk) {
                                emittedChunk = true;
                                controller.enqueue(new TextEncoder().encode("stale"));
                                return;
                            }

                            controller.error(new Error("Connection dropped."));
                        },
                    });
                    const response = new Response(body, {
                        headers: {
                            "Content-Disposition": "attachment; filename=\"restart.txt\"",
                            "Content-Length": "13",
                            "ETag": "\"restart-1\"",
                        },
                        status: 200,
                    });

                    Object.defineProperty(response, "url", {
                        value: "https://example.com/restart.txt",
                    });

                    return response;
                }

                expect(headers.get("Range")).toBe("bytes=5-");
                expect(headers.get("If-Range")).toBe("\"restart-1\"");

                const response = new Response("stale-payload", {
                    headers: {
                        "Content-Disposition": "attachment; filename=\"restart.txt\"",
                        "Content-Length": "13",
                        "ETag": "\"restart-2\"",
                    },
                    status: 200,
                });

                Object.defineProperty(response, "url", {
                    value: "https://example.com/restart.txt",
                });

                return response;
            };

            const firstResult = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/restart.txt",
                    outputDirectoryPath,
                ],
                {
                    fetcher,
                },
            );
            const secondResult = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/restart.txt",
                    outputDirectoryPath,
                ],
                {
                    fetcher,
                },
            );
            const downloadedFilePath = join(outputDirectoryPath, "restart.txt");

            expect(firstResult.exitCode).toBe(1);
            expect(secondResult.exitCode).toBe(0);
            expect(createCliSnapshot(firstResult, { sandbox }).stderr).toContain(
                "Failed to download the file at <HOME>/downloads/restart.",
            );
            expect(createCliSnapshot(secondResult, { sandbox })).toEqual({
                exitCode: 0,
                stderr: "",
                stdout: "Saved to: <HOME>/downloads/restart.txt\n",
            });
            expect(requestCount).toBe(2);
            await expect(Bun.file(downloadedFilePath).text()).resolves.toBe("stale-payload");
            expect(await readdir(outputDirectoryPath)).toEqual([
                "restart.txt",
            ]);
            expect(await countDownloadSidecarSessions(downloadSessionsDirectoryPath)).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
