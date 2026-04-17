import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    readLatestLogContent,
} from "../../../__tests__/helpers.ts";
import packageManifest from "../../../package.json" with { type: "json" };

const packageName = packageManifest.name;

describe("checkUpdateCommand CLI", () => {
    test("writes update-check lifecycle logs when check-update finds a newer release", async () => {
        const sandbox = await createCliSandbox();

        try {
            sandbox.env.npm_config_user_agent = "pnpm/10.0.0 node/v22.0.0";

            const result = await sandbox.run(
                ["check-update"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        "dist-tags": {
                            latest: "1.2.0",
                        },
                    })),
                    packageName,
                    stdout: {
                        isTTY: true,
                    },
                    version: "1.0.0",
                },
            );
            const content = await readLatestLogContent(sandbox);

            expect(createCliSnapshot(result)).toMatchSnapshot();
            expect(content).toContain(`"msg":"CLI update check started."`);
            expect(content).toContain(
                `"msg":"CLI update latest-release request started."`,
            );
            expect(content).toContain(
                `"msg":"CLI update latest-release request completed."`,
            );
            expect(content).toContain(`"msg":"CLI update notice emitted."`);
            expect(content).toContain(`"latestVersion":"1.2.0"`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not automatically check for updates after unrelated commands", async () => {
        const sandbox = await createCliSandbox();
        let fetchCount = 0;

        try {
            const result = await sandbox.run(
                ["config", "path"],
                {
                    fetcher: async () => {
                        fetchCount += 1;
                        throw new Error("fetch should not be called");
                    },
                },
            );
            const content = await readLatestLogContent(sandbox);

            expect(createCliSnapshot(result, { sandbox })).toMatchSnapshot();
            expect(fetchCount).toBe(0);
            expect(content).not.toContain(`"msg":"CLI update check started."`);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("retries twice before printing a retry-later message", async () => {
        const sandbox = await createCliSandbox();
        const originalSleep = Bun.sleep;
        let fetchCount = 0;

        try {
            Bun.sleep = (() => Promise.resolve()) as typeof Bun.sleep;

            const fetcher = async () => {
                fetchCount += 1;
                throw new Error("temporary network failure");
            };
            const firstResult = await sandbox.run(
                ["check-update"],
                {
                    fetcher,
                    version: "1.0.0",
                },
            );
            const secondResult = await sandbox.run(
                ["check-update"],
                {
                    fetcher,
                    version: "1.0.0",
                },
            );

            expect({
                firstResult: createCliSnapshot(firstResult),
                secondResult: createCliSnapshot(secondResult),
            }).toMatchSnapshot();
            expect(fetchCount).toBe(6);
        }
        finally {
            Bun.sleep = originalSleep;
            await sandbox.cleanup();
        }
    });

    test("does not cache failed update checks between check-update invocations", async () => {
        const sandbox = await createCliSandbox();
        const originalSleep = Bun.sleep;
        let fetchCount = 0;

        try {
            Bun.sleep = (() => Promise.resolve()) as typeof Bun.sleep;

            const fetcher = async () => {
                fetchCount += 1;

                if (fetchCount <= 3) {
                    throw new Error("temporary network failure");
                }

                return new Response(JSON.stringify({
                    "dist-tags": {
                        latest: "1.2.0",
                    },
                }));
            };
            const firstResult = await sandbox.run(
                ["check-update"],
                {
                    fetcher,
                    version: "1.0.0",
                },
            );
            const secondResult = await sandbox.run(
                ["check-update"],
                {
                    fetcher,
                    version: "1.0.0",
                },
            );

            expect(firstResult.exitCode).toBe(0);
            expect(secondResult.exitCode).toBe(0);
            expect({
                firstResult: createCliSnapshot(firstResult),
                secondResult: createCliSnapshot(secondResult),
            }).toMatchSnapshot();
            expect(fetchCount).toBe(4);
        }
        finally {
            Bun.sleep = originalSleep;
            await sandbox.cleanup();
        }
    });

    test("fetches the latest registry version on every check-update invocation", async () => {
        const sandbox = await createCliSandbox();
        let fetchCount = 0;

        try {
            const fetcher = async () => {
                fetchCount += 1;

                return new Response(JSON.stringify({
                    "dist-tags": {
                        latest: fetchCount === 1 ? "1.2.0" : "1.3.0",
                    },
                }));
            };
            const firstResult = await sandbox.run(
                ["check-update"],
                {
                    fetcher,
                    version: "1.0.0",
                },
            );
            const secondResult = await sandbox.run(
                ["check-update"],
                {
                    fetcher,
                    version: "1.0.0",
                },
            );

            expect({
                firstResult: createCliSnapshot(firstResult),
                secondResult: createCliSnapshot(secondResult),
            }).toMatchSnapshot();
            expect(fetchCount).toBe(2);
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints a friendly message when check-update receives an unsupported version", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["check-update"],
                {
                    version: "development",
                },
            );

            expect(createCliSnapshot(result)).toMatchSnapshot();
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
