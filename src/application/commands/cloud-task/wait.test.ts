import type {
    CliCatalog,
    CliExecutionContext,
    Fetcher,
    InteractiveInput,
} from "../../contracts/cli.ts";
import type { Translator } from "../../contracts/translator.ts";
import type { AuthFile } from "../../schemas/auth.ts";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createAuthStore,
    createCacheStore,
    createNoopFileDownloadSessionStore,
    createNoopFileUploadStore,
    createSettingsStore,
    createTextBuffer,
} from "../../../../__tests__/helpers.ts";
import { enMessages } from "../../../i18n/catalog.ts";
import {
    createCloudTaskWaitHandler,
    parseCloudTaskWaitTimeout,
    readCloudTaskWaitPrintIntervalMs,
    shouldPrintCloudTaskWaitUpdate,
} from "./wait.ts";

const activeAuthFile: AuthFile = {
    id: "user-1",
    auth: [
        {
            id: "user-1",
            name: "Alice",
            apiKey: "secret-1",
            endpoint: "oomol.com",
        },
    ],
};
const emptyCatalog: CliCatalog = {
    name: "oo",
    descriptionKey: "catalog.description",
    globalOptions: [],
    commands: [],
};
const translator: Translator = {
    locale: "en",
    t: (key, params) => {
        let value: string = enMessages[key as keyof typeof enMessages];

        if (params === undefined) {
            return value;
        }

        for (const [name, parameterValue] of Object.entries(params)) {
            value = value.replaceAll(`{${name}}`, String(parameterValue));
        }

        return value;
    },
    resolveLocale: () => "en",
};
const stdin: InteractiveInput = {
    on() {},
    off() {},
};

describe("cloudTaskWaitCommand", () => {
    test("parses timeout values with seconds as the default unit", () => {
        expect(parseCloudTaskWaitTimeout(undefined)).toBe(21_600_000);
        expect(parseCloudTaskWaitTimeout("360")).toBe(360_000);
        expect(parseCloudTaskWaitTimeout("120s")).toBe(120_000);
        expect(parseCloudTaskWaitTimeout("1m")).toBe(60_000);
        expect(parseCloudTaskWaitTimeout("4h")).toBe(14_400_000);
    });

    test("rejects timeout values outside the supported range", () => {
        expect(() => parseCloudTaskWaitTimeout("9s")).toThrow(
            "errors.cloudTaskWait.invalidTimeout",
        );
        expect(() => parseCloudTaskWaitTimeout("25h")).toThrow(
            "errors.cloudTaskWait.invalidTimeout",
        );
        expect(() => parseCloudTaskWaitTimeout("1d")).toThrow(
            "errors.cloudTaskWait.invalidTimeout",
        );
    });

    test("uses staged wait update intervals", () => {
        expect(readCloudTaskWaitPrintIntervalMs(0)).toBe(60_000);
        expect(readCloudTaskWaitPrintIntervalMs(3_599_999)).toBe(60_000);
        expect(readCloudTaskWaitPrintIntervalMs(3_600_000)).toBe(180_000);
        expect(readCloudTaskWaitPrintIntervalMs(10_800_000)).toBe(300_000);

        expect(shouldPrintCloudTaskWaitUpdate(undefined, 0)).toBeTrue();
        expect(shouldPrintCloudTaskWaitUpdate(0, 59_000)).toBeFalse();
        expect(shouldPrintCloudTaskWaitUpdate(0, 60_000)).toBeTrue();
        expect(
            shouldPrintCloudTaskWaitUpdate(59 * 60_000, 61 * 60_000),
        ).toBeFalse();
        expect(
            shouldPrintCloudTaskWaitUpdate(59 * 60_000, 62 * 60_000),
        ).toBeTrue();
        expect(
            shouldPrintCloudTaskWaitUpdate(179 * 60_000, 183 * 60_000),
        ).toBeFalse();
        expect(
            shouldPrintCloudTaskWaitUpdate(179 * 60_000, 184 * 60_000),
        ).toBeTrue();
    });

    test("polls until the task succeeds and prints wait updates", async () => {
        let now = 0;
        const sleepCalls: number[] = [];
        const fetcher = createSequentialFetcher([
            {
                progress: 10,
                status: "running",
            },
            {
                progress: 20,
                status: "running",
            },
            {
                progress: 30,
                status: "running",
            },
            {
                status: "success",
            },
        ]);
        const { context, stdout } = createWaitContext({ fetcher });
        const handler = createCloudTaskWaitHandler({
            now: () => now,
            sleep: async (durationMs) => {
                sleepCalls.push(durationMs);
                now += durationMs;
            },
        });

        await handler(
            {
                taskId: "task-1",
                timeout: "10m",
            },
            context,
        );

        expect(fetcher.requestCount).toBe(4);
        expect(sleepCalls).toEqual([3_000, 3_000, 3_000]);
        expect(stdout.read()).toBe(
            [
                "Waiting for completion after 0s.",
                "▶ running",
                "  Task ID: task-1",
                "  Progress: [=---------] 10%",
                "",
                "✓ success",
                "  Task ID: task-1",
                "",
            ].join("\n"),
        );
    });

    test("prints the failed result before exiting with an error", async () => {
        let now = 0;
        const fetcher = createSequentialFetcher([
            {
                progress: 25,
                status: "running",
            },
            {
                error: "boom",
                status: "failed",
            },
        ]);
        const { context, stdout } = createWaitContext({ fetcher });
        const handler = createCloudTaskWaitHandler({
            now: () => now,
            sleep: async (durationMs) => {
                now += durationMs;
            },
        });

        await expect(
            handler(
                {
                    taskId: "task-1",
                    timeout: "10m",
                },
                context,
            ),
        ).rejects.toMatchObject({
            key: "errors.cloudTaskWait.failed",
        });

        expect(fetcher.requestCount).toBe(2);
        expect(stdout.read()).toBe(
            [
                "Waiting for completion after 0s.",
                "▶ running",
                "  Task ID: task-1",
                "  Progress: [===-------] 25%",
                "",
                "X failed",
                "  Task ID: task-1",
                "  Error: boom",
                "",
            ].join("\n"),
        );
    });

    test("times out after the configured wait window", async () => {
        let now = 0;
        const sleepCalls: number[] = [];
        const fetcher = createSequentialFetcher([
            {
                progress: 0,
                status: "queued",
            },
            {
                progress: 10,
                status: "running",
            },
            {
                progress: 20,
                status: "running",
            },
            {
                progress: 30,
                status: "running",
            },
        ]);
        const { context, stdout } = createWaitContext({ fetcher });
        const handler = createCloudTaskWaitHandler({
            now: () => now,
            sleep: async (durationMs) => {
                sleepCalls.push(durationMs);
                now += durationMs;
            },
        });

        await expect(
            handler(
                {
                    taskId: "task-1",
                    timeout: "10s",
                },
                context,
            ),
        ).rejects.toMatchObject({
            key: "errors.cloudTaskWait.timedOut",
        });

        expect(fetcher.requestCount).toBe(4);
        expect(sleepCalls).toEqual([3_000, 3_000, 3_000, 1_000]);
        expect(stdout.read()).toBe(
            [
                "Waiting for completion after 0s.",
                "○ queued",
                "  Task ID: task-1",
                "",
                "",
            ].join("\n"),
        );
    });
});

function createWaitContext(options: {
    fetcher: Fetcher;
}): {
    context: CliExecutionContext;
    stderr: ReturnType<typeof createTextBuffer>;
    stdout: ReturnType<typeof createTextBuffer>;
} {
    const stdout = createTextBuffer();
    const stderr = createTextBuffer();

    return {
        context: {
            authStore: createAuthStore(activeAuthFile),
            cacheStore: createCacheStore(),
            currentLogFilePath: "",
            fetcher: options.fetcher,
            cwd: process.cwd(),
            env: {},
            fileDownloadSessionStore: createNoopFileDownloadSessionStore(),
            fileUploadStore: createNoopFileUploadStore(),
            stdin,
            logger: pino({
                enabled: false,
            }),
            packageName: "@oomol-lab/oo-cli",
            settingsStore: createSettingsStore({}),
            stdout: stdout.writer,
            stderr: stderr.writer,
            translator,
            completionRenderer: {
                render: () => "",
            },
            catalog: emptyCatalog,
            version: "0.1.0",
        },
        stderr,
        stdout,
    };
}

function createSequentialFetcher(responses: readonly unknown[]): Fetcher & {
    requestCount: number;
} {
    let requestCount = 0;
    const fetcher = (async () => {
        const response = responses.at(requestCount) ?? responses.at(-1);

        requestCount += 1;

        return new Response(JSON.stringify(response));
    }) as unknown as Fetcher & {
        requestCount: number;
    };

    Object.defineProperty(fetcher, "requestCount", {
        enumerable: true,
        get() {
            return requestCount;
        },
    });

    return fetcher;
}
