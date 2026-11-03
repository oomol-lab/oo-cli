import { describe, expect, test } from "bun:test";

import { createLogCapture, expectCliUserError } from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import {
    normalizeFileUploadDownloadUrl,
    normalizeFileUploadDownloadUrlForDisplay,
    uploadFileParts,
} from "./shared.ts";

describe("normalizeFileUploadDownloadUrl", () => {
    test("normalizes non-ASCII paths, spaces, and IDN hosts", () => {
        expect(
            normalizeFileUploadDownloadUrl("https://download.example.com/files/\u5305 1.jpg"),
        ).toBe("https://download.example.com/files/%E5%8C%85%201.jpg");
        expect(
            normalizeFileUploadDownloadUrl(
                "https://download.example.com/files/\u65E5\u672C\u8A9E/\uD55C\uAE00/caf\u00E9.jpg",
            ),
        ).toBe(
            "https://download.example.com/files/%E6%97%A5%E6%9C%AC%E8%AA%9E/%ED%95%9C%EA%B8%80/caf%C3%A9.jpg",
        );
        expect(
            normalizeFileUploadDownloadUrl("https://\u4F8B\u3048.example.com/files/archive.txt"),
        ).toBe("https://xn--r8jz45g.example.com/files/archive.txt");
    });

    test("preserves existing escapes and query signature characters", () => {
        const normalizedUrl
            = "https://download.example.com/files/%E5%8C%85%201.jpg?signature=a+b%2Fc&label=%E5%8C%85";

        expect(
            normalizeFileUploadDownloadUrl(
                "https://download.example.com/files/\u5305 1.jpg?signature=a+b%2Fc&label=\u5305",
            ),
        ).toBe(normalizedUrl);
        expect(normalizeFileUploadDownloadUrl(normalizedUrl)).toBe(normalizedUrl);
    });

    test("rejects invalid server download URLs", () => {
        expect(expectCliUserError(() =>
            normalizeFileUploadDownloadUrl("not a url"),
        )).toMatchObject({
            key: "errors.fileUpload.invalidResponse",
        });
    });
});

describe("normalizeFileUploadDownloadUrlForDisplay", () => {
    test("normalizes parseable legacy download URLs", () => {
        expect(
            normalizeFileUploadDownloadUrlForDisplay(
                "https://download.example.com/files/\u53051.jpg",
            ),
        ).toBe("https://download.example.com/files/%E5%8C%851.jpg");
    });

    test("keeps unparseable legacy download URLs and logs only sanitized fields", () => {
        const logCapture = createLogCapture();
        const rawUrl = "not a url with secret-token";

        try {
            expect(
                normalizeFileUploadDownloadUrlForDisplay(rawUrl, logCapture.logger),
            ).toBe(rawUrl);

            const logs = logCapture.read();

            expect(logs).toContain(
                "Skipping URL normalization for unparseable legacy file upload record.",
            );
            expect(logs).toContain("\"errorName\":\"TypeError\"");
            expect(logs).toContain(`"rawUrlLength":${rawUrl.length}`);
            expect(logs).not.toContain(rawUrl);
            expect(logs).not.toContain("secret-token");
        }
        finally {
            logCapture.close();
        }
    });
});

describe("uploadFileParts", () => {
    test("keeps the request method in unexpected error logs", async () => {
        const logCapture = createLogCapture();
        const originalSleep = Bun.sleep;

        try {
            Bun.sleep = (() => Promise.resolve()) as typeof Bun.sleep;

            await expect(uploadFileParts(
                {
                    size: 1,
                    slice: () => new Blob(["a"]),
                },
                {
                    key: "file-upload/user-1/file-1/sample.txt",
                    partSize: 1,
                    totalParts: 1,
                    uploadID: "upload-1",
                },
                [
                    {
                        partNumber: 1,
                        uploadURL: "https://storage.example.com/upload/1",
                    },
                ],
                {
                    fetcher: async () => {
                        throw new Error("network down");
                    },
                    logger: logCapture.logger,
                    translator: createTranslator("en"),
                },
            )).rejects.toMatchObject({
                key: "errors.fileUpload.requestError",
            });

            const logs = logCapture.read();

            expect(logs).toContain(
                "\"msg\":\"File upload part request failed unexpectedly.\"",
            );
            expect(logs).toContain("\"method\":\"PUT\"");
        }
        finally {
            Bun.sleep = originalSleep;
            logCapture.close();
        }
    });

    test("retries file upload part network failures before succeeding", async () => {
        const logCapture = createLogCapture();
        const originalSleep = Bun.sleep;
        let fetchCount = 0;

        try {
            Bun.sleep = (() => Promise.resolve()) as typeof Bun.sleep;

            await uploadFileParts(
                {
                    size: 1,
                    slice: () => new Blob(["a"]),
                },
                {
                    key: "file-upload/user-1/file-1/sample.txt",
                    partSize: 1,
                    totalParts: 1,
                    uploadID: "upload-1",
                },
                [
                    {
                        partNumber: 1,
                        uploadURL: "https://storage.example.com/upload/1",
                    },
                ],
                {
                    fetcher: async () => {
                        fetchCount += 1;

                        if (fetchCount === 1) {
                            throw new Error("socket closed");
                        }

                        return new Response(null, {
                            headers: {
                                ETag: "\"etag-1\"",
                            },
                            status: 200,
                        });
                    },
                    logger: logCapture.logger,
                    translator: createTranslator("en"),
                },
            );

            const logs = logCapture.read();

            expect(fetchCount).toBe(2);
            expect(logs).toContain(
                "\"msg\":\"HTTP request retry scheduled after a network failure.\"",
            );
            expect(logs).toContain(
                "\"msg\":\"File upload part request completed.\"",
            );
        }
        finally {
            Bun.sleep = originalSleep;
            logCapture.close();
        }
    });

    test("uploads parts concurrently and returns them in part order", async () => {
        const logCapture = createLogCapture();
        const content = "abcdef";
        const receivedBodies = new Map<number, string>();
        const completionOrder: number[] = [];
        let inFlight = 0;
        let maxInFlight = 0;

        try {
            const uploadedParts = await uploadFileParts(
                createSliceableText(content),
                createUploadSession({ partSize: 1, totalParts: content.length }),
                createPresignedPartUrls(content.length),
                {
                    fetcher: async (input, init) => {
                        const partNumber = readPartNumber(input);

                        inFlight += 1;
                        maxInFlight = Math.max(maxInFlight, inFlight);
                        receivedBodies.set(
                            partNumber,
                            new TextDecoder().decode(init?.body as Uint8Array),
                        );
                        // Later parts finish first to prove ordering is
                        // independent of completion order.
                        await waitMs((content.length - partNumber) * 3);
                        inFlight -= 1;
                        completionOrder.push(partNumber);

                        return new Response(null, {
                            headers: { ETag: `"etag-${partNumber}"` },
                            status: 200,
                        });
                    },
                    logger: logCapture.logger,
                    translator: createTranslator("en"),
                },
            );

            expect(maxInFlight).toBe(2);
            expect(completionOrder).not.toEqual([1, 2, 3, 4, 5, 6]);
            expect(uploadedParts).toEqual(
                [1, 2, 3, 4, 5, 6].map(partNumber => ({
                    etag: `"etag-${partNumber}"`,
                    partNumber,
                })),
            );
            expect([...receivedBodies.entries()].sort(([left], [right]) => left - right))
                .toEqual([[1, "a"], [2, "b"], [3, "c"], [4, "d"], [5, "e"], [6, "f"]]);
        }
        finally {
            logCapture.close();
        }
    });

    test("stops starting new parts after one part fails", async () => {
        const logCapture = createLogCapture();
        const startedParts: number[] = [];
        let settledCount = 0;

        try {
            const error = await expectCliUserError(uploadFileParts(
                createSliceableText("abcdefgh"),
                createUploadSession({ partSize: 1, totalParts: 8 }),
                createPresignedPartUrls(8),
                {
                    fetcher: async (input) => {
                        const partNumber = readPartNumber(input);

                        startedParts.push(partNumber);

                        if (partNumber === 1) {
                            return new Response("denied", { status: 403 });
                        }

                        await waitMs(5);
                        settledCount += 1;

                        return new Response(null, {
                            headers: { ETag: `"etag-${partNumber}"` },
                            status: 200,
                        });
                    },
                    logger: logCapture.logger,
                    translator: createTranslator("en"),
                },
            ));

            expect(error.key).toBe("errors.fileUpload.requestFailed");
            expect(startedParts.sort()).toEqual([1, 2]);
            // In-flight parts settle before the failure is reported.
            expect(settledCount).toBe(1);
        }
        finally {
            logCapture.close();
        }
    });

    test("rejects a missing presigned URL before uploading any part", async () => {
        let fetchCount = 0;

        const error = await expectCliUserError(uploadFileParts(
            createSliceableText("ab"),
            createUploadSession({ partSize: 1, totalParts: 2 }),
            createPresignedPartUrls(1),
            {
                fetcher: async () => {
                    fetchCount += 1;
                    return new Response(null, { headers: { ETag: "\"etag\"" } });
                },
                logger: createLogCapture().logger,
                translator: createTranslator("en"),
            },
        ));

        expect(error.key).toBe("errors.fileUpload.invalidResponse");
        expect(fetchCount).toBe(0);
    });
});

// ASCII-only content, so character offsets equal byte offsets.
function createSliceableText(content: string) {
    return {
        size: content.length,
        slice: (start?: number, end?: number) => new Blob([content.slice(start, end)]),
    };
}

function createUploadSession(options: { partSize: number; totalParts: number }) {
    return {
        key: "file-upload/user-1/file-1/sample.txt",
        partSize: options.partSize,
        totalParts: options.totalParts,
        uploadID: "upload-1",
    };
}

function createPresignedPartUrls(count: number) {
    return Array.from({ length: count }, (_, index) => ({
        partNumber: index + 1,
        uploadURL: `https://storage.example.com/upload/${index + 1}`,
    }));
}

function readPartNumber(input: string | URL | Request): number {
    const url = input instanceof Request ? input.url : String(input);

    return Number(url.slice(url.lastIndexOf("/") + 1));
}

async function waitMs(durationMs: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, durationMs));
}
