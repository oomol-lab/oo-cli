import { describe, expect, test } from "bun:test";

import { createLogCapture } from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { uploadFileParts } from "./shared.ts";

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
                    partSize: 1,
                    presignedUrls: {
                        1: "https://storage.example.com/upload/1",
                    },
                    totalParts: 1,
                    uploadId: "upload-1",
                },
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
                    partSize: 1,
                    presignedUrls: {
                        1: "https://storage.example.com/upload/1",
                    },
                    totalParts: 1,
                    uploadId: "upload-1",
                },
                {
                    fetcher: async () => {
                        fetchCount += 1;

                        if (fetchCount === 1) {
                            throw new Error("socket closed");
                        }

                        return new Response(null, {
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
