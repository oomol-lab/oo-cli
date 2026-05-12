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
});
