import { mkdir, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
} from "../../../../__tests__/helpers.ts";

describe("file download CLI", () => {
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

            expect(createCliSnapshot(
                result,
                {
                    sandbox,
                    stripAnsi: true,
                },
            )).toMatchSnapshot();
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

            expect(createCliSnapshot(result, {
                sandbox,
                stripAnsi: true,
            })).toMatchSnapshot();
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

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
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

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
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

            expect({
                download: createCliSnapshot(downloadResult, { sandbox }),
                setConfig: createCliSnapshot(setConfigResult, { sandbox }),
            }).toMatchSnapshot();
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

            expect({
                download: createCliSnapshot(downloadResult, { sandbox }),
                setConfig: createCliSnapshot(setConfigResult, { sandbox }),
            }).toMatchSnapshot();
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

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
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

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
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

            expect(createCliSnapshot(result)).toMatchSnapshot();
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

            expect({
                invalidExt: createCliSnapshot(invalidExtResult),
                invalidName: createCliSnapshot(invalidNameResult),
            }).toMatchSnapshot();
            expect(invalidNameResult.stderr).toContain("Invalid value for --name");

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

            expect(createCliSnapshot(result)).toMatchSnapshot();
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

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
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

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
            await expect(Bun.file(join(outputDirectoryPath, "download")).text()).resolves.toBe(
                "payload",
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
