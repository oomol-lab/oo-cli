import { mkdir, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import {
    countDownloadResumeSessions,
    createCliSandbox,
    readFileDownloadSuccessOutput,
    toRequest,
} from "../../../../__tests__/helpers.ts";
import {
    SqliteFileDownloadSessionStore,
} from "../../../adapters/store/sqlite-file-download-session-store.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";

describe("file CLI", () => {
    test("supports file upload and persists the uploaded record", async () => {
        const sandbox = await createCliSandbox();
        const uploadsFilePath = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        }).uploadsFilePath;
        const localFilePath = join(sandbox.env.HOME!, "sample.txt");

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );
            await Bun.write(localFilePath, "hello world");

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["file", "upload", localFilePath],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.endsWith("/init")) {
                            return new Response(JSON.stringify({
                                data: {
                                    part_size: 4,
                                    presigned_urls: {
                                        1: "https://storage.example.com/upload/1",
                                        2: "https://storage.example.com/upload/2",
                                        3: "https://storage.example.com/upload/3",
                                    },
                                    total_parts: 3,
                                    upload_id: "upload-1",
                                },
                            }));
                        }

                        if (request.url.endsWith("/url")) {
                            return new Response(JSON.stringify({
                                data: {
                                    expires_at: "3026-03-27T00:00:00.000Z",
                                    file_name: "sample.txt",
                                    file_size: 11,
                                    mime_type: "text/plain",
                                    url: "https://download.example.com/file-1?signature=abc",
                                },
                            }));
                        }

                        return new Response(null, {
                            status: 200,
                        });
                    },
                },
            );
            const database = new Database(uploadsFilePath, {
                strict: true,
            });

            try {
                expect(result.exitCode).toBe(0);
                expect(result.stderr).toBe("");
                expect(result.stdout).toContain("Uploaded sample.txt.");
                expect(result.stdout).toContain(
                    "https://download.example.com/file-1?signature=abc",
                );
                expect(requests.map(request => request.url)).toEqual([
                    "https://llm.oomol.com/api/tasks/files/remote-cache/init",
                    "https://storage.example.com/upload/1",
                    "https://storage.example.com/upload/2",
                    "https://storage.example.com/upload/3",
                    "https://llm.oomol.com/api/tasks/files/remote-cache/upload-1/url",
                ]);
                expect(requests[0]?.headers.get("Authorization")).toBe("secret-1");
                expect(requests[0]?.method).toBe("POST");
                await expect(requests[0]?.json()).resolves.toEqual({
                    file_extension: ".txt",
                    file_name: "sample",
                    size: 11,
                });
                expect(
                    database.query(
                        [
                            "SELECT",
                            "file_name AS fileName,",
                            "file_size AS fileSize,",
                            "download_url AS downloadUrl,",
                            "expires_at_ms AS expiresAtMs",
                            "FROM uploaded_files",
                        ].join(" "),
                    ).all(),
                ).toEqual([
                    {
                        downloadUrl: "https://download.example.com/file-1?signature=abc",
                        expiresAtMs: Date.parse("3026-03-27T00:00:00.000Z"),
                        fileName: "sample.txt",
                        fileSize: 11,
                    },
                ]);
            }
            finally {
                database.close();
            }
        }
        finally {
            await Bun.file(localFilePath).delete();
            await sandbox.cleanup();
        }
    });

    test("supports file download, creates missing directories, and prints the labeled saved path", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "downloads", "reports");
        const relativeOutputDirectory = relative(sandbox.cwd, outputDirectoryPath);

        try {
            const result = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/download?id=1#fragment",
                    relativeOutputDirectory,
                ],
                {
                    fetcher: async () => {
                        const response = new Response("hello world", {
                            headers: {
                                "Content-Disposition": "attachment; filename=\"report\"",
                                "Content-Length": "11",
                                "Content-Type": "application/pdf",
                            },
                            status: 200,
                        });

                        Object.defineProperty(response, "url", {
                            value: "https://cdn.example.com/files/archive.tar.gz?signature=abc",
                        });

                        return response;
                    },
                    stderr: {
                        isTTY: true,
                    },
                },
            );
            const downloadedFilePath = join(outputDirectoryPath, "report.tar.gz");

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(readFileDownloadSuccessOutput(downloadedFilePath));
            expect(result.stderr).toContain("Downloaded");
            expect(result.stderr).toContain("100%");
            await expect(Bun.file(downloadedFilePath).text()).resolves.toBe("hello world");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("renders file download progress with human-readable byte units", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "downloads", "reports");
        const relativeOutputDirectory = relative(sandbox.cwd, outputDirectoryPath);
        const content = new Uint8Array(2 * 1024).fill(97);

        try {
            const result = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/archive.bin",
                    relativeOutputDirectory,
                ],
                {
                    fetcher: async () => new Response(content, {
                        headers: {
                            "Content-Disposition": "attachment; filename=\"archive.bin\"",
                            "Content-Length": `${content.byteLength}`,
                            "Content-Type": "application/octet-stream",
                        },
                        status: 200,
                    }),
                    stderr: {
                        isTTY: true,
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toContain("2 KB / 2 KB (100%)");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("keeps the cursor on the line below file download progress output", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "downloads", "reports");
        const relativeOutputDirectory = relative(sandbox.cwd, outputDirectoryPath);

        try {
            const result = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/chunked.bin",
                    relativeOutputDirectory,
                ],
                {
                    fetcher: async () => new Response(new ReadableStream<Uint8Array>({
                        start(controller) {
                            controller.enqueue(new TextEncoder().encode("ab"));
                            controller.enqueue(new TextEncoder().encode("cd"));
                            controller.close();
                        },
                    }), {
                        headers: {
                            "Content-Disposition": "attachment; filename=\"chunked.bin\"",
                            "Content-Length": "4",
                            "Content-Type": "application/octet-stream",
                        },
                        status: 200,
                    }),
                    stderr: {
                        isTTY: true,
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe(
                "Downloading 0 B / 4 B (0%)\n"
                + "\u001B[1A\r\u001B[2KDownloaded 4 B / 4 B (100%)\n",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uses the default downloads directory when file download output directory is omitted", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "Downloads");

        try {
            const result = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/download?id=default-target",
                ],
                {
                    fetcher: async () => new Response("default target", {
                        headers: {
                            "Content-Disposition": "attachment; filename=\"report.txt\"",
                            "Content-Length": "14",
                            "Content-Type": "text/plain",
                        },
                        status: 200,
                    }),
                },
            );
            const downloadedFilePath = join(outputDirectoryPath, "report.txt");

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(readFileDownloadSuccessOutput(downloadedFilePath));
            await expect(Bun.file(downloadedFilePath).text()).resolves.toBe(
                "default target",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uses the configured file download output directory and expands a leading tilde", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "Downloads", "reports");

        try {
            const setConfigResult = await sandbox.run([
                "config",
                "set",
                "file.download.out_dir",
                "~/Downloads/reports",
            ]);
            const downloadResult = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/download?id=2",
                ],
                {
                    fetcher: async () => new Response("configured target", {
                        headers: {
                            "Content-Disposition": "attachment; filename=\"report.txt\"",
                            "Content-Length": "17",
                            "Content-Type": "text/plain",
                        },
                        status: 200,
                    }),
                },
            );
            const downloadedFilePath = join(outputDirectoryPath, "report.txt");

            expect(setConfigResult.exitCode).toBe(0);
            expect(downloadResult.exitCode).toBe(0);
            expect(downloadResult.stdout).toBe(readFileDownloadSuccessOutput(downloadedFilePath));
            await expect(Bun.file(downloadedFilePath).text()).resolves.toBe(
                "configured target",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uses the current cli working directory when file.download.out_dir is dot", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = sandbox.cwd;

        try {
            const setConfigResult = await sandbox.run([
                "config",
                "set",
                "file.download.out_dir",
                ".",
            ]);
            const downloadResult = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/download?id=3",
                ],
                {
                    fetcher: async () => new Response("cwd target", {
                        headers: {
                            "Content-Disposition": "attachment; filename=\"config-dot-target.txt\"",
                            "Content-Length": "10",
                            "Content-Type": "text/plain",
                        },
                        status: 200,
                    }),
                },
            );
            const downloadedFilePath = join(outputDirectoryPath, "config-dot-target.txt");

            expect(setConfigResult.exitCode).toBe(0);
            expect(downloadResult.exitCode).toBe(0);
            expect(downloadResult.stdout).toBe(readFileDownloadSuccessOutput(downloadedFilePath));
            await expect(Bun.file(downloadedFilePath).text()).resolves.toBe("cwd target");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("auto-renames conflicting targets and removes temporary files after file download", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "downloads");

        try {
            await mkdir(outputDirectoryPath, { recursive: true });
            await Bun.write(join(outputDirectoryPath, "download.pdf"), "existing");
            await Bun.write(join(outputDirectoryPath, "download_1.oodownload"), "stale");

            const result = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/download",
                    outputDirectoryPath,
                ],
                {
                    fetcher: async () => new Response("fresh pdf", {
                        headers: {
                            "Content-Type": "application/pdf",
                        },
                        status: 200,
                    }),
                },
            );
            const outputEntries = await readdir(outputDirectoryPath);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                readFileDownloadSuccessOutput(join(outputDirectoryPath, "download_1.pdf")),
            );
            expect(outputEntries).toHaveLength(3);
            expect(outputEntries).toEqual(expect.arrayContaining([
                "download.pdf",
                "download_1.oodownload",
                "download_1.pdf",
            ]));
            await expect(Bun.file(join(outputDirectoryPath, "download_1.pdf")).text()).resolves.toBe(
                "fresh pdf",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails file download when the output path already exists as a file", async () => {
        const sandbox = await createCliSandbox();
        const outputPath = join(sandbox.env.HOME!, "not-a-directory");

        try {
            await Bun.write(outputPath, "occupied");

            let fetchCount = 0;
            const result = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/download",
                    outputPath,
                ],
                {
                    fetcher: async () => {
                        fetchCount += 1;
                        return new Response("unreachable");
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain("not a directory");
            expect(fetchCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails file download before fetching when the url is invalid", async () => {
        const sandbox = await createCliSandbox();

        try {
            let fetchCount = 0;
            const result = await sandbox.run(
                [
                    "file",
                    "download",
                    "ftp://example.com/file.txt",
                ],
                {
                    fetcher: async () => {
                        fetchCount += 1;
                        return new Response("unreachable");
                    },
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain("Invalid URL");
            expect(fetchCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails file download before fetching when --name or --ext is invalid", async () => {
        const sandbox = await createCliSandbox();

        try {
            let fetchCount = 0;
            const invalidNameResult = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/file.txt",
                    "--name",
                    "..",
                ],
                {
                    fetcher: async () => {
                        fetchCount += 1;
                        return new Response("unreachable");
                    },
                },
            );
            const invalidExtResult = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/file.txt",
                    "--ext",
                    "..txt",
                ],
                {
                    fetcher: async () => {
                        fetchCount += 1;
                        return new Response("unreachable");
                    },
                },
            );

            expect(invalidNameResult.exitCode).toBe(2);
            expect(invalidNameResult.stdout).toBe("");
            expect(invalidNameResult.stderr).toContain("Invalid value for --name");

            expect(invalidExtResult.exitCode).toBe(2);
            expect(invalidExtResult.stdout).toBe("");
            expect(invalidExtResult.stderr).toContain("Invalid value for --ext");
            expect(fetchCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails file download when the download request returns a non-success status", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "downloads");

        try {
            await mkdir(outputDirectoryPath, { recursive: true });

            const result = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/missing.txt",
                    outputDirectoryPath,
                ],
                {
                    fetcher: async () => new Response("missing", {
                        status: 404,
                    }),
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain("HTTP 404");
            expect(await readdir(outputDirectoryPath)).toEqual([]);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails file download when the output directory cannot be created", async () => {
        const sandbox = await createCliSandbox();
        const occupiedPath = join(sandbox.env.HOME!, "occupied");
        const nestedOutputDirectory = join(occupiedPath, "nested");

        try {
            await Bun.write(occupiedPath, "occupied");

            let fetchCount = 0;
            const result = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/file.txt",
                    nestedOutputDirectory,
                ],
                {
                    fetcher: async () => {
                        fetchCount += 1;
                        return new Response("unreachable");
                    },
                },
            );

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain("Failed to prepare the output directory");
            expect(fetchCount).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("uses the default download file name when the final response url has no file segment", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "downloads");

        try {
            const result = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/files/",
                    outputDirectoryPath,
                ],
                {
                    fetcher: async () => {
                        const response = new Response("payload", {
                            status: 200,
                        });

                        Object.defineProperty(response, "url", {
                            value: "https://example.com/files/",
                        });

                        return response;
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toBe(
                readFileDownloadSuccessOutput(join(outputDirectoryPath, "download")),
            );
            await expect(Bun.file(join(outputDirectoryPath, "download")).text()).resolves.toBe(
                "payload",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("preserves the temporary file and resume session when file download fails mid-download", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "downloads");
        const downloadSessionsFilePath = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        }).downloadSessionsFilePath;

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
            expect(result.stdout).toBe("");
            expect(result.stderr).toContain("Downloading");
            expect(result.stderr).not.toContain("Downloaded");
            expect(result.stderr).toContain("Connection dropped.");
            const outputEntries = await readdir(outputDirectoryPath);

            expect(outputEntries).toHaveLength(1);
            expect(outputEntries).toEqual([
                "broken.oodownload",
            ]);
            expect(countDownloadResumeSessions(downloadSessionsFilePath)).toBe(1);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("cleans up download resume sessions older than 14 days when file download starts", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "downloads");
        const downloadSessionsFilePath = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        }).downloadSessionsFilePath;
        const sessionStore = new SqliteFileDownloadSessionStore(
            downloadSessionsFilePath,
        );

        try {
            await mkdir(outputDirectoryPath, { recursive: true });
            sessionStore.saveDownloadSession({
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

            const result = await sandbox.run(
                [
                    "file",
                    "download",
                    "https://example.com/fresh.txt",
                    outputDirectoryPath,
                ],
                {
                    fetcher: async () => new Response("fresh", {
                        headers: {
                            "Content-Disposition": "attachment; filename=\"fresh.txt\"",
                            "Content-Length": "5",
                        },
                        status: 200,
                    }),
                },
            );

            expect(result.exitCode).toBe(0);
            expect(countDownloadResumeSessions(downloadSessionsFilePath)).toBe(0);
        }
        finally {
            sessionStore.close();
            await sandbox.cleanup();
        }
    });

    test("resumes file download with HTTP Range after a mid-download failure", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "downloads");
        const downloadSessionsFilePath = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        }).downloadSessionsFilePath;
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
            expect(firstResult.stderr).toContain("Connection dropped.");
            expect(secondResult.exitCode).toBe(0);
            expect(secondResult.stderr).toBe("");
            expect(secondResult.stdout).toBe(readFileDownloadSuccessOutput(downloadedFilePath));
            expect(requestCount).toBe(2);
            await expect(Bun.file(downloadedFilePath).text()).resolves.toBe("partial-payload");
            expect(await readdir(outputDirectoryPath)).toEqual([
                "broken.txt",
            ]);
            expect(countDownloadResumeSessions(downloadSessionsFilePath)).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("restarts file download from the beginning when the server ignores Range", async () => {
        const sandbox = await createCliSandbox();
        const outputDirectoryPath = join(sandbox.env.HOME!, "downloads");
        const downloadSessionsFilePath = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        }).downloadSessionsFilePath;
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
            expect(secondResult.stderr).toBe("");
            expect(secondResult.stdout).toBe(readFileDownloadSuccessOutput(downloadedFilePath));
            expect(requestCount).toBe(2);
            await expect(Bun.file(downloadedFilePath).text()).resolves.toBe("stale-payload");
            expect(await readdir(outputDirectoryPath)).toEqual([
                "restart.txt",
            ]);
            expect(countDownloadResumeSessions(downloadSessionsFilePath)).toBe(0);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("supports file upload json output for both --json and --format=json", async () => {
        const sandbox = await createCliSandbox();
        const firstFilePath = join(sandbox.env.HOME!, "sample-json.txt");
        const secondFilePath = join(sandbox.env.HOME!, "sample-format.txt");

        try {
            const authFilePath = join(
                sandbox.env.XDG_CONFIG_HOME!,
                APP_NAME,
                "auth.toml",
            );

            await Bun.write(
                authFilePath,
                [
                    "id = \"user-1\"",
                    "",
                    "[[auth]]",
                    "id = \"user-1\"",
                    "name = \"Alice\"",
                    "api_key = \"secret-1\"",
                    "endpoint = \"oomol.com\"",
                    "",
                ].join("\n"),
            );
            await Bun.write(firstFilePath, "json upload");
            await Bun.write(secondFilePath, "format upload");

            let uploadIndex = 0;
            const fetcher = async (input: string | URL | Request, init?: RequestInit) => {
                const request = toRequest(input, init);

                if (request.url.endsWith("/init")) {
                    uploadIndex += 1;

                    return new Response(JSON.stringify({
                        data: {
                            part_size: 32,
                            presigned_urls: {
                                1: `https://storage.example.com/upload/${uploadIndex}`,
                            },
                            total_parts: 1,
                            upload_id: `upload-${uploadIndex}`,
                        },
                    }));
                }

                if (request.url.endsWith("/url")) {
                    return new Response(JSON.stringify({
                        data: {
                            expires_at: "3026-03-27T00:00:00.000Z",
                            file_name: "sample.txt",
                            file_size: 11,
                            mime_type: "text/plain",
                            url: `https://download.example.com/file-${uploadIndex}?signature=abc`,
                        },
                    }));
                }

                return new Response(null, {
                    status: 200,
                });
            };

            const jsonAliasResult = await sandbox.run(
                ["file", "upload", firstFilePath, "--json"],
                {
                    fetcher,
                },
            );
            const jsonFormatResult = await sandbox.run(
                ["file", "upload", secondFilePath, "--format=json"],
                {
                    fetcher,
                },
            );

            expect(jsonAliasResult.exitCode).toBe(0);
            expect(jsonAliasResult.stderr).toBe("");
            expect(JSON.parse(jsonAliasResult.stdout)).toMatchObject({
                downloadUrl: "https://download.example.com/file-1?signature=abc",
                expiresAt: "3026-03-27T00:00:00.000Z",
                fileName: "sample-json.txt",
                fileSize: 11,
                status: "active",
            });
            expect(jsonFormatResult.exitCode).toBe(0);
            expect(jsonFormatResult.stderr).toBe("");
            expect(JSON.parse(jsonFormatResult.stdout)).toMatchObject({
                downloadUrl: "https://download.example.com/file-2?signature=abc",
                expiresAt: "3026-03-27T00:00:00.000Z",
                fileName: "sample-format.txt",
                fileSize: 13,
                status: "active",
            });
        }
        finally {
            await Bun.file(firstFilePath).delete();
            await Bun.file(secondFilePath).delete();
            await sandbox.cleanup();
        }
    });

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
            expect(listTextResult.stderr).toBe("");
            expect(listTextResult.stdout).toContain("active.txt");
            expect(listTextResult.stdout).toContain("https://download.example.com/active");

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

    test("supports file upload command help with the --json alias", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["file", "upload", "--help"]);

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            expect(result.stdout).toContain("--json");
            expect(result.stdout).toContain("Alias for --format=json");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
