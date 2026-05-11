import { truncate } from "node:fs/promises";

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
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../../telemetry/outbox.ts";
import { maxFileUploadSizeBytes } from "./shared.ts";

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

                        if (request.url.endsWith("/create-multipart-upload")) {
                            return new Response(JSON.stringify({
                                success: true,
                                data: {
                                    key: "file-upload/user-1/file-1/sample.txt",
                                    partSize: 4,
                                    totalParts: 3,
                                    uploadID: "upload-1",
                                },
                            }));
                        }

                        if (request.url.endsWith("/generate-presigned-urls")) {
                            return new Response(JSON.stringify({
                                success: true,
                                data: [
                                    {
                                        partNumber: 1,
                                        uploadURL: "https://storage.example.com/upload/1",
                                    },
                                    {
                                        partNumber: 2,
                                        uploadURL: "https://storage.example.com/upload/2",
                                    },
                                    {
                                        partNumber: 3,
                                        uploadURL: "https://storage.example.com/upload/3",
                                    },
                                ],
                            }));
                        }

                        if (request.url.startsWith("https://storage.example.com/upload/")) {
                            const partNumber = request.url.slice(
                                "https://storage.example.com/upload/".length,
                            );

                            return new Response(null, {
                                headers: {
                                    ETag: `"etag-${partNumber}"`,
                                },
                                status: 200,
                            });
                        }

                        if (request.url.endsWith("/complete-multipart-upload")) {
                            return new Response(JSON.stringify({
                                success: true,
                                data: {
                                    downloadURL: "https://download.example.com/file-1?signature=abc",
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
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            try {
                expect(createFileUploadSnapshot(result)).toMatchSnapshot();
                expect(requests.map(request => request.url)).toEqual([
                    "https://fusion-api.oomol.com/v1/file-upload/action/create-multipart-upload",
                    "https://fusion-api.oomol.com/v1/file-upload/action/generate-presigned-urls",
                    "https://storage.example.com/upload/1",
                    "https://storage.example.com/upload/2",
                    "https://storage.example.com/upload/3",
                    "https://fusion-api.oomol.com/v1/file-upload/action/complete-multipart-upload",
                ]);
                expect(requests
                    .filter(request => request.url.startsWith("https://fusion-api.oomol.com/"))
                    .map(request => request.headers.get("Authorization")))
                    .toEqual(["secret-1", "secret-1", "secret-1"]);
                expect(requests[0]?.method).toBe("POST");
                await expect(requests[0]?.json()).resolves.toEqual({
                    fileSize: 11,
                    filename: "sample.txt",
                });
                await expect(requests[1]?.json()).resolves.toEqual({
                    key: "file-upload/user-1/file-1/sample.txt",
                    partNumbers: [1, 2, 3],
                    uploadID: "upload-1",
                });
                await expect(requests[5]?.json()).resolves.toEqual({
                    key: "file-upload/user-1/file-1/sample.txt",
                    parts: [
                        {
                            etag: "\"etag-1\"",
                            partNumber: 1,
                        },
                        {
                            etag: "\"etag-2\"",
                            partNumber: 2,
                        },
                        {
                            etag: "\"etag-3\"",
                            partNumber: 3,
                        },
                    ],
                    uploadID: "upload-1",
                });
                expect(telemetryPayload).toMatchObject({
                    properties: {
                        bytes_total_bucket: "<1KB",
                        command_full: "file.upload",
                        rejected_too_large: false,
                    },
                });
                expect(telemetryPayload?.properties).not.toHaveProperty("file_name");
                expect(telemetryPayload?.properties).not.toHaveProperty("path");
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
                        expiresAtMs: expect.any(Number),
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

    test("uses the development fusion-api host for development accounts", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "dev-sample.txt");

        try {
            await writeAuthFile(sandbox, {
                accounts: [
                    {
                        id: "user-1",
                        name: "Alice",
                        apiKey: "secret-1",
                        endpoint: "oomol.dev",
                    },
                ],
            });
            await Bun.write(localFilePath, "dev upload");

            const requests: Request[] = [];
            const result = await sandbox.run(
                ["file", "upload", localFilePath, "--json"],
                {
                    fetcher: async (input, init) => {
                        const request = toRequest(input, init);

                        requests.push(request);

                        if (request.url.endsWith("/create-multipart-upload")) {
                            return new Response(JSON.stringify({
                                success: true,
                                data: {
                                    key: "file-upload/user-1/file-1/dev-sample.txt",
                                    partSize: 64,
                                    totalParts: 1,
                                    uploadID: "upload-1",
                                },
                            }));
                        }

                        if (request.url.endsWith("/generate-presigned-urls")) {
                            return new Response(JSON.stringify({
                                success: true,
                                data: [
                                    {
                                        partNumber: 1,
                                        uploadURL: "https://storage.example.com/upload/1",
                                    },
                                ],
                            }));
                        }

                        if (request.url.startsWith("https://storage.example.com/upload/")) {
                            return new Response(null, {
                                headers: {
                                    ETag: "\"etag-1\"",
                                },
                                status: 200,
                            });
                        }

                        if (request.url.endsWith("/complete-multipart-upload")) {
                            return new Response(JSON.stringify({
                                success: true,
                                data: {
                                    downloadURL: "https://download.example.com/dev-file?signature=abc",
                                },
                            }));
                        }

                        return new Response(null, {
                            status: 200,
                        });
                    },
                },
            );

            expect(result.exitCode).toBe(0);
            expect(requests
                .filter(request => request.url.includes("/v1/file-upload/action/"))
                .map(request => request.url))
                .toEqual([
                    "https://fusion-api.oomol.dev/v1/file-upload/action/create-multipart-upload",
                    "https://fusion-api.oomol.dev/v1/file-upload/action/generate-presigned-urls",
                    "https://fusion-api.oomol.dev/v1/file-upload/action/complete-multipart-upload",
                ]);
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

                if (request.url.endsWith("/create-multipart-upload")) {
                    uploadIndex += 1;

                    return new Response(JSON.stringify({
                        success: true,
                        data: {
                            key: `file-upload/user-1/file-${uploadIndex}/sample.txt`,
                            partSize: 32,
                            totalParts: 1,
                            uploadID: `upload-${uploadIndex}`,
                        },
                    }));
                }

                if (request.url.endsWith("/generate-presigned-urls")) {
                    return new Response(JSON.stringify({
                        success: true,
                        data: [
                            {
                                partNumber: 1,
                                uploadURL: `https://storage.example.com/upload/${uploadIndex}`,
                            },
                        ],
                    }));
                }

                if (request.url.startsWith("https://storage.example.com/upload/")) {
                    return new Response(null, {
                        headers: {
                            ETag: `"etag-${uploadIndex}"`,
                        },
                        status: 200,
                    });
                }

                if (request.url.endsWith("/complete-multipart-upload")) {
                    return new Response(JSON.stringify({
                        success: true,
                        data: {
                            downloadURL: `https://download.example.com/file-${uploadIndex}?signature=abc`,
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
                expiresAt: expect.any(String),
                fileName: "sample-json.txt",
                fileSize: 11,
                status: "active",
            });
            expect(JSON.parse(jsonFormatResult.stdout)).toMatchObject({
                downloadUrl: "https://download.example.com/file-2?signature=abc",
                expiresAt: expect.any(String),
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

    test("records rejected too large telemetry without file identity", async () => {
        const sandbox = await createCliSandbox();
        const localFilePath = join(sandbox.env.HOME!, "large-upload.bin");

        try {
            await writeAuthFile(sandbox);
            await Bun.write(localFilePath, "");
            await truncate(localFilePath, maxFileUploadSizeBytes + 1);

            const result = await sandbox.run(["file", "upload", localFilePath]);
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

            expect(result.exitCode).toBe(2);
            expect(telemetryPayload).toMatchObject({
                properties: {
                    bytes_total_bucket: "100MB+",
                    command_full: "file.upload",
                    error_category: "user_error",
                    rejected_too_large: true,
                },
            });
            expect(telemetryPayload?.properties).not.toHaveProperty("file_name");
            expect(telemetryPayload?.properties).not.toHaveProperty("path");
        }
        finally {
            await Bun.file(localFilePath).delete();
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
            createOutputLineReplacement(result.stdout, "  - Expires at: ", "<EXPIRES_AT>"),
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
        expiresAt?: string;
        id?: string;
        uploadedAt?: string;
    };

    return createCliSnapshot(result, {
        replacements: [
            createOptionalReplacement("<UPLOAD_ID>", output.id),
            createOptionalReplacement("<EXPIRES_AT>", output.expiresAt),
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
