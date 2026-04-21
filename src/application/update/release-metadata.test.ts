import { describe, expect, test } from "bun:test";

import { createLogCapture, requireAbortSignal } from "../../../__tests__/helpers.ts";
import { fetchLatestCliReleaseVersion } from "./release-metadata.ts";

describe("release metadata", () => {
    test("allows callers to use a longer request timeout", async () => {
        const logCapture = createLogCapture();

        try {
            const version = await fetchLatestCliReleaseVersion({
                currentVersion: "1.0.0",
                fetcher: async (_, init) => {
                    const signal = requireAbortSignal(init);

                    if (signal.aborted) {
                        throw new Error("aborted");
                    }

                    await Bun.sleep(20);

                    if (signal.aborted) {
                        throw new Error("aborted");
                    }

                    return new Response(JSON.stringify({
                        version: "1.2.3",
                    }));
                },
                logger: logCapture.logger,
                timeoutMs: 50,
            });

            expect(version).toBe("1.2.3");
        }
        finally {
            logCapture.close();
        }
    });

    test("returns null when the request times out", async () => {
        const logCapture = createLogCapture();

        try {
            const version = await fetchLatestCliReleaseVersion({
                currentVersion: "1.0.0",
                fetcher: (_, init) => new Promise<Response>((_, reject) => {
                    const signal = requireAbortSignal(init);

                    signal.addEventListener("abort", () => {
                        reject(new Error("aborted"));
                    }, { once: true });
                }),
                logger: logCapture.logger,
                timeoutMs: 5,
            });

            expect(version).toBeNull();
        }
        finally {
            logCapture.close();
        }
    });
});
