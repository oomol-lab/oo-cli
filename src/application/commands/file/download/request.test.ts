import { describe, expect, test } from "bun:test";

import {
    createLogCapture,
} from "../../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../../i18n/translator.ts";
import {
    createDownloadSessionRecordFixture,
    expectCliUserError,
    setResponseUrl,
} from "./__tests__/helpers.ts";
import { requestFreshDownload, requestResumeDownload } from "./request.ts";

describe("requestFreshDownload", () => {
    test("sends the identity accept-encoding header", async () => {
        const logCapture = createLogCapture();
        const requestUrl = new URL("https://example.com/files/report.txt?download=1");
        let receivedHeaders: Headers | undefined;

        try {
            const response = setResponseUrl(
                new Response("payload", {
                    status: 200,
                }),
                "https://cdn.example.com/files/report.txt",
            );
            const result = await requestFreshDownload(requestUrl, {
                fetcher: async (_url, init) => {
                    receivedHeaders = new Headers(init?.headers);
                    return response;
                },
                logger: logCapture.logger,
                translator: createTranslator("en"),
            });

            expect(result).toBe(response);
            expect(receivedHeaders?.get("Accept-Encoding")).toBe("identity");
        }
        finally {
            logCapture.close();
        }
    });

    test("keeps presigned query values out of the request logs", async () => {
        const logCapture = createLogCapture();
        const requestUrl = new URL(
            "https://download.example.com/files/report.txt?signature=start-secret&expires=1700000000",
        );

        try {
            const response = setResponseUrl(
                new Response("payload", {
                    status: 200,
                }),
                "https://cdn.example.com/files/report.txt?signature=redirect-secret",
            );

            await requestFreshDownload(requestUrl, {
                fetcher: async () => response,
                logger: logCapture.logger,
                translator: createTranslator("en"),
            });

            const logContent = logCapture.read();

            expect(logContent).not.toContain("start-secret");
            expect(logContent).not.toContain("redirect-secret");
            expect(logContent).toContain(
                "\"url\":\"https://download.example.com/files/report.txt?signature=REDACTED&expires=REDACTED\"",
            );
            expect(logContent).toContain(
                "\"finalUrl\":\"https://cdn.example.com/files/report.txt?signature=REDACTED\"",
            );
        }
        finally {
            logCapture.close();
        }
    });

    test("keeps presigned query values out of transport-failure logs", async () => {
        const logCapture = createLogCapture();
        const requestUrl = new URL(
            "https://download.example.com/files/report.txt?signature=transport-secret",
        );

        try {
            await expectCliUserError(requestFreshDownload(requestUrl, {
                fetcher: async () => {
                    throw Object.assign(new Error("Unable to connect."), {
                        code: "ConnectionRefused",
                        path: requestUrl.toString(),
                    });
                },
                logger: logCapture.logger,
                translator: createTranslator("en"),
            }));

            const logContent = logCapture.read();

            expect(logContent).not.toContain("transport-secret");
            expect(logContent).toContain("signature=REDACTED");
        }
        finally {
            logCapture.close();
        }
    });

    test("rejects non-success statuses that are not explicitly allowed", async () => {
        const logCapture = createLogCapture();

        try {
            const error = await expectCliUserError(requestFreshDownload(
                new URL("https://example.com/files/missing.txt"),
                {
                    fetcher: async () => new Response("missing", {
                        status: 404,
                    }),
                    logger: logCapture.logger,
                    translator: createTranslator("en"),
                },
            ));

            expect(error.key).toBe("errors.fileDownload.requestFailed");
            expect(error.params).toEqual({
                status: 404,
            });
        }
        finally {
            logCapture.close();
        }
    });

    test("wraps unexpected fetcher errors", async () => {
        const logCapture = createLogCapture();

        try {
            const error = await expectCliUserError(requestFreshDownload(
                new URL("https://example.com/files/broken.txt"),
                {
                    fetcher: async () => {
                        throw new Error("Connection dropped.");
                    },
                    logger: logCapture.logger,
                    translator: createTranslator("en"),
                },
            ));

            expect(error.key).toBe("errors.fileDownload.requestError");
            expect(error.params).toEqual({
                message: "Connection dropped.",
            });
            expect(logCapture.read()).toContain(
                "\"msg\":\"File download request failed unexpectedly.\"",
            );
        }
        finally {
            logCapture.close();
        }
    });
});

describe("requestResumeDownload", () => {
    test("sends range and if-range headers for strong etags", async () => {
        const logCapture = createLogCapture();
        const session = createDownloadSessionRecordFixture({
            entityTag: "\"etag-strong\"",
            lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
        });
        let receivedHeaders: Headers | undefined;

        try {
            const response = await requestResumeDownload(
                new URL("https://example.com/files/report.txt"),
                {
                    fetcher: async (_url, init) => {
                        receivedHeaders = new Headers(init?.headers);
                        return new Response("tail", {
                            status: 206,
                        });
                    },
                    logger: logCapture.logger,
                    translator: createTranslator("en"),
                },
                7,
                session,
            );

            expect(response.status).toBe(206);
            expect(receivedHeaders?.get("Accept-Encoding")).toBe("identity");
            expect(receivedHeaders?.get("Range")).toBe("bytes=7-");
            expect(receivedHeaders?.get("If-Range")).toBe("\"etag-strong\"");
        }
        finally {
            logCapture.close();
        }
    });

    test("falls back to last-modified for weak etags and allows 416", async () => {
        const logCapture = createLogCapture();
        const session = createDownloadSessionRecordFixture({
            entityTag: "W/\"etag-weak\"",
            lastModified: "Wed, 01 Jan 2025 00:00:00 GMT",
        });
        let receivedHeaders: Headers | undefined;

        try {
            const response = await requestResumeDownload(
                new URL("https://example.com/files/report.txt"),
                {
                    fetcher: async (_url, init) => {
                        receivedHeaders = new Headers(init?.headers);
                        return new Response(null, {
                            status: 416,
                        });
                    },
                    logger: logCapture.logger,
                    translator: createTranslator("en"),
                },
                10,
                session,
            );

            expect(response.status).toBe(416);
            expect(receivedHeaders?.get("Range")).toBe("bytes=10-");
            expect(receivedHeaders?.get("If-Range")).toBe(
                "Wed, 01 Jan 2025 00:00:00 GMT",
            );
        }
        finally {
            logCapture.close();
        }
    });
});
