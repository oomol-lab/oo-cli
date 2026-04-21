import type { Cache, CacheOptions, CacheStore } from "../contracts/cache.ts";

import type { CliExecutionContext } from "../contracts/cli.ts";
import { describe, expect, test } from "bun:test";
import {
    createLogCapture,
    createNoopFileDownloadSessionStore,
    createNoopFileUploadStore,
    createTextBuffer,
} from "../../../__tests__/helpers.ts";
import { createTranslator } from "../../i18n/translator.ts";
import { defaultAuthFile } from "../schemas/auth.ts";
import { defaultSettings } from "../schemas/settings.ts";
import { compareSemver } from "../semver.ts";
import { createRetryingFetcher } from "../shared/retrying-fetcher.ts";
import { createTerminalColors } from "../terminal-colors.ts";
import {
    checkForCliUpdate,
    cliUpdateCommand,
    renderCliUpdateNotice,
} from "./update-notifier.ts";

const packageName = "@oomol-lab/oo-cli";

describe("update notifier", () => {
    test("compares stable and prerelease versions", () => {
        expect(compareSemver("1.2.4", "1.2.3")).toBe(1);
        expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
        expect(compareSemver("1.2.3", "1.2.4")).toBe(-1);
        expect(compareSemver("1.2.3", "1.2.3-beta.1")).toBe(1);
        expect(compareSemver("1.2.3-beta.2", "1.2.3-beta.10")).toBe(-1);
        expect(compareSemver("1.2.3+build.1", "1.2.3+build.2")).toBe(0);
    });

    test("accepts build metadata in the current version check", async () => {
        const notifier = createUpdateNotifierHarness({
            fetcher: async () => new Response(JSON.stringify({
                version: "1.0.1",
            })),
        });

        try {
            notifier.context.version = "1.0.0+build.1";
            notifier.context.versionText = "1.0.0+build.1";

            const result = await checkForCliUpdate(notifier.context);

            expect(result).toEqual({
                latestVersion: "1.0.1",
                status: "update-available",
            });
        }
        finally {
            notifier.close();
        }
    });

    test("uses the built-in update command", () => {
        expect(cliUpdateCommand).toBe("oo update");
    });

    test("returns an available update and renders the upgrade notice", async () => {
        const stdout = createTextBuffer({
            hasColors: true,
        });
        let fetchCount = 0;
        const notifier = createUpdateNotifierHarness({
            fetcher: async () => {
                fetchCount += 1;

                return new Response(JSON.stringify({
                    version: "1.2.0",
                }));
            },
            stdout: stdout.writer,
        });

        try {
            const result = await checkForCliUpdate(notifier.context);
            const notice = renderCliUpdateNotice({
                context: notifier.context,
                latestVersion: "1.2.0",
                updateCommand: cliUpdateCommand,
                writer: stdout.writer,
            });
            const strippedNotice = createTerminalColors(true).strip(notice);

            expect(result).toEqual({
                latestVersion: "1.2.0",
                status: "update-available",
            });
            expect(notice).toContain("\u001B[");
            expect(strippedNotice).toContain("Update available 1.0.0 → 1.2.0");
            expect(strippedNotice).toContain(`Run ${cliUpdateCommand} to update`);
            expect(strippedNotice).toContain("╭");
            expect(strippedNotice).toContain("╯");
            expect(fetchCount).toBe(1);
        }
        finally {
            notifier.close();
        }
    });

    test("returns an available update when the latest-release response needs extra setup time", async () => {
        const notifier = createUpdateNotifierHarness({
            fetcher: async () => {
                await Bun.sleep(1000);

                return new Response(JSON.stringify({
                    version: "1.2.0",
                }));
            },
        });

        try {
            const result = await checkForCliUpdate(notifier.context);

            expect(result).toEqual({
                latestVersion: "1.2.0",
                status: "update-available",
            });
        }
        finally {
            notifier.close();
        }
    });

    test("returns up-to-date when the current version matches the latest release", async () => {
        const notifier = createUpdateNotifierHarness({
            fetcher: async () => new Response(JSON.stringify({
                version: "1.0.0",
            })),
        });

        try {
            const result = await checkForCliUpdate(notifier.context);

            expect(result).toEqual({
                latestVersion: "1.0.0",
                status: "up-to-date",
            });
        }
        finally {
            notifier.close();
        }
    });

    test("fails when the latest release version cannot be resolved", async () => {
        let fetchCount = 0;
        const notifier = createUpdateNotifierHarness({
            fetcher: async () => {
                fetchCount += 1;
                throw new Error("temporary network failure");
            },
        });

        try {
            const result = await checkForCliUpdate(notifier.context);

            expect(result).toEqual({
                reason: "latest-version-unavailable",
                status: "failed",
            });
            expect(fetchCount).toBe(3);
        }
        finally {
            notifier.close();
        }
    });

    test("returns latest-version-unavailable after retrying a retryable latest-release response", async () => {
        let fetchCount = 0;
        const notifier = createUpdateNotifierHarness({
            fetcher: async () => {
                fetchCount += 1;

                return new Response("{}", {
                    status: 503,
                });
            },
        });

        try {
            const result = await checkForCliUpdate(notifier.context);

            expect(result).toEqual({
                reason: "latest-version-unavailable",
                status: "failed",
            });
            expect(fetchCount).toBe(3);
        }
        finally {
            notifier.close();
        }
    });

    test("returns latest-version-unavailable when latest-release JSON parsing fails", async () => {
        let fetchCount = 0;
        const notifier = createUpdateNotifierHarness({
            fetcher: async () => {
                fetchCount += 1;

                return new Response("not-json");
            },
        });

        try {
            const result = await checkForCliUpdate(notifier.context);

            expect(result).toEqual({
                reason: "latest-version-unavailable",
                status: "failed",
            });
            expect(fetchCount).toBe(1);
        }
        finally {
            notifier.close();
        }
    });

    test("returns latest-version-unavailable when version is missing", async () => {
        let fetchCount = 0;
        const notifier = createUpdateNotifierHarness({
            fetcher: async () => {
                fetchCount += 1;

                return new Response(JSON.stringify({
                    name: packageName,
                }));
            },
        });

        try {
            const result = await checkForCliUpdate(notifier.context);

            expect(result).toEqual({
                reason: "latest-version-unavailable",
                status: "failed",
            });
            expect(fetchCount).toBe(1);
        }
        finally {
            notifier.close();
        }
    });

    test("returns latest-version-unavailable when version is empty", async () => {
        let fetchCount = 0;
        const notifier = createUpdateNotifierHarness({
            fetcher: async () => {
                fetchCount += 1;

                return new Response(JSON.stringify({
                    version: "",
                }));
            },
        });

        try {
            const result = await checkForCliUpdate(notifier.context);

            expect(result).toEqual({
                reason: "latest-version-unavailable",
                status: "failed",
            });
            expect(fetchCount).toBe(1);
        }
        finally {
            notifier.close();
        }
    });

    test("returns latest-version-unavailable when version is not valid semver", async () => {
        let fetchCount = 0;
        const notifier = createUpdateNotifierHarness({
            fetcher: async () => {
                fetchCount += 1;

                return new Response(JSON.stringify({
                    version: "latest",
                }));
            },
        });

        try {
            const result = await checkForCliUpdate(notifier.context);

            expect(result).toEqual({
                reason: "latest-version-unavailable",
                status: "failed",
            });
            expect(fetchCount).toBe(1);
        }
        finally {
            notifier.close();
        }
    });

    test("retries once within the same update check after a transient failure", async () => {
        let fetchCount = 0;
        const notifier = createUpdateNotifierHarness({
            fetcher: async () => {
                fetchCount += 1;

                if (fetchCount === 1) {
                    throw new Error("temporary network failure");
                }

                return new Response(JSON.stringify({
                    version: "1.2.0",
                }));
            },
        });

        try {
            const result = await checkForCliUpdate(notifier.context);

            expect(result).toEqual({
                latestVersion: "1.2.0",
                status: "update-available",
            });
            expect(fetchCount).toBe(2);
        }
        finally {
            notifier.close();
        }
    });

    test("does not cache failed update checks between invocations", async () => {
        let fetchCount = 0;
        const notifier = createUpdateNotifierHarness({
            fetcher: async () => {
                fetchCount += 1;

                if (fetchCount <= 3) {
                    throw new Error("temporary network failure");
                }

                return new Response(JSON.stringify({
                    version: "1.2.0",
                }));
            },
        });

        try {
            const firstResult = await checkForCliUpdate(notifier.context);
            const secondResult = await checkForCliUpdate(notifier.context);

            expect(firstResult).toEqual({
                reason: "latest-version-unavailable",
                status: "failed",
            });
            expect(secondResult).toEqual({
                latestVersion: "1.2.0",
                status: "update-available",
            });
            expect(fetchCount).toBe(4);
        }
        finally {
            notifier.close();
        }
    });

    test("fetches the latest release version for every update check", async () => {
        let fetchCount = 0;
        const notifier = createUpdateNotifierHarness({
            fetcher: async () => {
                fetchCount += 1;

                return new Response(JSON.stringify({
                    version: fetchCount === 1 ? "1.1.0" : "1.2.0",
                }));
            },
        });

        try {
            const firstResult = await checkForCliUpdate(notifier.context);
            const secondResult = await checkForCliUpdate(notifier.context);

            expect(firstResult).toEqual({
                latestVersion: "1.1.0",
                status: "update-available",
            });
            expect(secondResult).toEqual({
                latestVersion: "1.2.0",
                status: "update-available",
            });
            expect(fetchCount).toBe(2);
        }
        finally {
            notifier.close();
        }
    });
});

function createUpdateNotifierHarness(options: {
    cacheStore?: CacheStore;
    fetcher: CliExecutionContext["fetcher"];
    stderr?: CliExecutionContext["stderr"];
    stdout?: CliExecutionContext["stdout"];
}): {
    close: () => void;
    context: CliExecutionContext;
} {
    const logCapture = createLogCapture();

    const context: CliExecutionContext = {
        authStore: {
            getFilePath: () => "",
            read: async () => defaultAuthFile,
            write: async auth => auth,
            update: async updater => updater(defaultAuthFile),
        },
        cacheStore: options.cacheStore ?? createMemoryCacheStore(() => Date.now()),
        catalog: {
            commands: [],
            descriptionKey: "catalog.description",
            globalOptions: [],
            name: "oo",
        },
        completionRenderer: {
            render: () => "",
        },
        currentLogFilePath: "",
        execPath: process.execPath,
        cwd: "",
        env: {},
        fetcher: createRetryingFetcher({
            fetcher: options.fetcher,
            logger: logCapture.logger,
            sleep: async () => {},
        }),
        fileDownloadSessionStore: createNoopFileDownloadSessionStore(),
        fileUploadStore: createNoopFileUploadStore(),
        logger: logCapture.logger,
        packageName,
        settingsStore: {
            getFilePath: () => "",
            read: async () => defaultSettings,
            write: async settings => settings,
            update: async updater => updater(defaultSettings),
        },
        stderr: options.stderr ?? createTextBuffer().writer,
        stdin: {
            off() {},
            on() {},
        },
        stdout: options.stdout ?? createTextBuffer().writer,
        translator: createTranslator("en"),
        version: "1.0.0",
        versionText: "1.0.0",
    };

    return {
        close: logCapture.close,
        context,
    };
}

function createMemoryCacheStore(now: () => number): CacheStore {
    const caches = new Map<string, Cache<unknown>>();

    return {
        close() {},
        getCache<Value>(options: CacheOptions) {
            const existingCache = caches.get(options.id);

            if (existingCache) {
                return existingCache as Cache<Value>;
            }

            const entries = new Map<string, {
                expiresAtMs: number | null;
                value: Value;
            }>();
            const cache: Cache<Value> = {
                clear() {
                    entries.clear();
                },
                delete(key) {
                    return entries.delete(key);
                },
                get(key) {
                    const entry = entries.get(key);

                    if (!entry) {
                        return null;
                    }

                    if (entry.expiresAtMs !== null && entry.expiresAtMs <= now()) {
                        entries.delete(key);
                        return null;
                    }

                    return entry.value;
                },
                has(key) {
                    return cache.get(key) !== null;
                },
                set(key, value, setOptions = {}) {
                    const ttlMs = setOptions.ttlMs ?? options.defaultTtlMs;

                    entries.set(key, {
                        expiresAtMs: ttlMs === undefined ? null : now() + ttlMs,
                        value,
                    });
                },
            };

            caches.set(options.id, cache as Cache<unknown>);

            return cache;
        },
        getFilePath: () => "",
    };
}
