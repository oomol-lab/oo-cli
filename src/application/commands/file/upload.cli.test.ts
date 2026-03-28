import { join } from "node:path";

import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    toRequest,
    writeAuthFile,
} from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";

describe("file upload CLI", () => {
    test("supports file upload and persists the uploaded record", async () => {
        const sandbox = await createCliSandbox();
        const uploadsFilePath = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        }).uploadsFilePath;
        const localFilePath = join(sandbox.env.HOME!, "sample.txt");

        try {
            await writeAuthFile(sandbox);
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
                expect(createFileUploadSnapshot(result)).toMatchSnapshot();
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

    test("supports file upload json output for both --json and --format=json", async () => {
        const sandbox = await createCliSandbox();
        const firstFilePath = join(sandbox.env.HOME!, "sample-json.txt");
        const secondFilePath = join(sandbox.env.HOME!, "sample-format.txt");

        try {
            await writeAuthFile(sandbox);
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

            expect({
                jsonAliasResult: createFileUploadJsonSnapshot(jsonAliasResult),
                jsonFormatResult: createFileUploadJsonSnapshot(jsonFormatResult),
            }).toMatchSnapshot();
            expect(JSON.parse(jsonAliasResult.stdout)).toMatchObject({
                downloadUrl: "https://download.example.com/file-1?signature=abc",
                expiresAt: "3026-03-27T00:00:00.000Z",
                fileName: "sample-json.txt",
                fileSize: 11,
                status: "active",
            });
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

    test("supports file upload command help with the --json alias", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(["file", "upload", "--help"]);

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });
});

function createFileUploadSnapshot(
    result: {
        readonly exitCode: number;
        readonly stdout: string;
        readonly stderr: string;
    },
) {
    return createCliSnapshot(result, {
        replacements: [
            createOutputLineReplacement(result.stdout, "  - ID: ", "<UPLOAD_ID>"),
            createOutputLineReplacement(result.stdout, "  - Uploaded at: ", "<UPLOADED_AT>"),
        ].filter((replacement): replacement is {
            readonly placeholder: string;
            readonly value: string;
        } => replacement !== undefined),
    });
}

function createFileUploadJsonSnapshot(
    result: {
        readonly exitCode: number;
        readonly stdout: string;
        readonly stderr: string;
    },
) {
    const output = JSON.parse(result.stdout) as {
        id?: string;
        uploadedAt?: string;
    };

    return createCliSnapshot(result, {
        replacements: [
            createOptionalReplacement("<UPLOAD_ID>", output.id),
            createOptionalReplacement("<UPLOADED_AT>", output.uploadedAt),
        ].filter((replacement): replacement is {
            readonly placeholder: string;
            readonly value: string;
        } => replacement !== undefined),
    });
}

function createOutputLineReplacement(
    output: string,
    prefix: string,
    placeholder: string,
) {
    const line = output
        .split("\n")
        .find(candidate => candidate.startsWith(prefix));

    if (line === undefined) {
        return undefined;
    }

    return {
        placeholder,
        value: line.slice(prefix.length),
    };
}

function createOptionalReplacement(
    placeholder: string,
    value: string | undefined,
) {
    if (value === undefined) {
        return undefined;
    }

    return {
        placeholder,
        value,
    };
}
