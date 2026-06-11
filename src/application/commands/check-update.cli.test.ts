import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createCliSandbox,
    createCliSnapshot,
    readLatestLogContent,
} from "../../../__tests__/helpers.ts";
import { APP_NAME } from "../config/app-config.ts";
import {
    parseTelemetryRowPayload,
    readTelemetryRowsForTest,
} from "../telemetry/outbox.ts";

describe("checkUpdateCommand CLI", () => {
    test("writes update-check lifecycle logs when check-update finds a newer release", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["check-update"],
                {
                    fetcher: async () => new Response(JSON.stringify({
                        version: "1.2.0",
                    })),
                    stdout: {
                        isTTY: true,
                    },
                    version: "1.0.0",
                },
            );
            const content = await readLatestLogContent(sandbox);
            const telemetryPayload = parseTelemetryRowPayload(
                readTelemetryRowsForTest(
                    join(sandbox.env.XDG_CONFIG_HOME!, APP_NAME, "telemetry"),
                )[0]!,
            );

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
            expect(telemetryPayload).toMatchObject({
                properties: {
                    command_full: "check-update",
                    update_available: true,
                    version_kind: "stable",
                },
            });
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
                    version: "1.2.0",
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

    test("fetches the latest release version on every check-update invocation", async () => {
        const sandbox = await createCliSandbox();
        let fetchCount = 0;

        try {
            const fetcher = async () => {
                fetchCount += 1;

                return new Response(JSON.stringify({
                    version: fetchCount === 1 ? "1.2.0" : "1.3.0",
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

    test("--json emits update-available payload with currentVersion and latestVersion", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["check-update", "--json"],
                {
                    fetcher: async () => new Response(JSON.stringify({ version: "1.3.0" })),
                    version: "1.2.3",
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload).toEqual({
                status: "update-available",
                currentVersion: "1.2.3",
                latestVersion: "1.3.0",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json emits up-to-date payload with matching latestVersion", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["check-update", "--json"],
                {
                    fetcher: async () => new Response(JSON.stringify({ version: "1.2.3" })),
                    version: "1.2.3",
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload).toEqual({
                status: "up-to-date",
                currentVersion: "1.2.3",
                latestVersion: "1.2.3",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json up-to-date reports remote latestVersion when current is ahead of remote", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["check-update", "--json"],
                {
                    fetcher: async () => new Response(JSON.stringify({ version: "1.2.3" })),
                    version: "1.3.0",
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            // status is up-to-date because current >= remote, but latestVersion
            // must reflect what the server actually said, not echo currentVersion.
            expect(payload).toEqual({
                status: "up-to-date",
                currentVersion: "1.3.0",
                latestVersion: "1.2.3",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json emits failed payload (exit 0) when latest-version is unavailable", async () => {
        const sandbox = await createCliSandbox();
        const originalSleep = Bun.sleep;

        try {
            // Skip retry backoff so the test stays fast.
            Bun.sleep = (() => Promise.resolve()) as typeof Bun.sleep;

            const result = await sandbox.run(
                ["check-update", "--json"],
                {
                    fetcher: async () => {
                        throw new Error("temporary network failure");
                    },
                    version: "1.2.3",
                },
            );

            expect(result.exitCode).toBe(0);
            expect(result.stderr).toBe("");
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.status).toBe("failed");
            expect(payload.currentVersion).toBe("1.2.3");
            expect(payload.message).toBeTypeOf("string");
            expect(payload).not.toHaveProperty("latestVersion");
        }
        finally {
            Bun.sleep = originalSleep;
            await sandbox.cleanup();
        }
    });

    test("--json emits failed payload for unsupported version", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["check-update", "--json"],
                {
                    version: "development",
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.status).toBe("failed");
            expect(payload.currentVersion).toBe("development");
            expect(payload.message).toBeTypeOf("string");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--json --show-schema-version prepends schemaVersion", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["check-update", "--json", "--show-schema-version"],
                {
                    fetcher: async () => new Response(JSON.stringify({ version: "1.2.3" })),
                    version: "1.2.3",
                },
            );

            expect(result.exitCode).toBe(0);
            const payload = JSON.parse(result.stdout) as Record<string, unknown>;

            expect(payload.schemaVersion).toBe("1.0.0");
            expect(payload.status).toBe("up-to-date");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("--format xml exits 2 with a format error", async () => {
        const sandbox = await createCliSandbox();

        try {
            const result = await sandbox.run(
                ["check-update", "--format", "xml"],
                {
                    version: "1.2.3",
                },
            );

            expect(result.exitCode).toBe(2);
            expect(result.stderr).not.toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("refuses to run when OO_NO_SELF_UPDATE is set", async () => {
        const sandbox = await createCliSandbox();

        sandbox.env.OO_NO_SELF_UPDATE = "1";

        try {
            const result = await sandbox.run(["check-update"], {
                fetcher: () => {
                    throw new Error("check-update must not fetch when disabled");
                },
                version: "1.0.0",
            });

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("OO_NO_SELF_UPDATE");
            expect(result.stdout).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
