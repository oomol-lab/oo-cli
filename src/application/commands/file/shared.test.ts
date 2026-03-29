import { describe, expect, test } from "bun:test";

import { createLogCapture } from "../../../../__tests__/helpers.ts";
import { uploadFileParts } from "./shared.ts";

describe("uploadFileParts", () => {
    test("keeps the request method in unexpected error logs", async () => {
        const logCapture = createLogCapture();
        const originalSetTimeout = globalThis.setTimeout;

        try {
            globalThis.setTimeout = ((handler: unknown, _timeout?: number, ...args: unknown[]) => {
                if (typeof handler === "function") {
                    (handler as (...callbackArgs: unknown[]) => void)(...args);
                }

                return 0 as unknown as ReturnType<typeof setTimeout>;
            }) as typeof setTimeout;

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
            globalThis.setTimeout = originalSetTimeout;
            logCapture.close();
        }
    });
});
