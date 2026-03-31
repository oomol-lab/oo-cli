import type {
    CliCatalog,
    CliExecutionContext,
    Fetcher,
    InteractiveInput,
} from "../../contracts/cli.ts";
import type { AuthFile } from "../../schemas/auth.ts";
import type { AppSettings } from "../../schemas/settings.ts";

import { lstat, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createAuthStore,
    createCacheStore,
    createNoopFileUploadStore,
    createSettingsStore,
    createTemporaryDirectory,
    createTextBuffer,
    readFileDownloadSuccessOutput,
} from "../../../../__tests__/helpers.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { fileDownloadCommand } from "./download.ts";
import {
    createDownloadSessionRecordFixture,
    createDownloadSessionStoreSpy,
    expectCliUserError,
} from "./download/__tests__/helpers.ts";

const downloadHandler = fileDownloadCommand.handler!;
const staleDownloadSessionTtlMs = 14 * 24 * 60 * 60 * 1000;
const emptyAuthFile: AuthFile = {
    auth: [],
    id: "",
};
const emptyCatalog: CliCatalog = {
    name: "oo",
    descriptionKey: "catalog.description",
    globalOptions: [],
    commands: [],
};
const stdin: InteractiveInput = {
    on() {},
    off() {},
};

describe("fileDownloadCommand", () => {
    test("downloads a fresh file and cleans up the stored session", async () => {
        const root = await createTemporaryDirectory("download-command-fresh");
        const outputDirectoryPath = join(root, "downloads");
        const sessionStore = createDownloadSessionStoreSpy();
        const contextHandle = createDownloadContext({
            cwd: root,
            fetcher: async () => new Response("hello", {
                headers: {
                    "Content-Disposition": "attachment; filename=\"report.txt\"",
                    "Content-Length": "5",
                    "Content-Type": "text/plain",
                },
                status: 200,
            }),
            fileDownloadSessionStore: sessionStore.store,
            settings: {},
        });
        const cutoffBefore = Date.now() - staleDownloadSessionTtlMs;

        try {
            await downloadHandler({
                outDir: outputDirectoryPath,
                url: "https://example.com/files/report.txt",
            }, contextHandle.context);

            const downloadedFilePath = join(outputDirectoryPath, "report.txt");

            expect(sessionStore.deletedSessionCutoffs).toHaveLength(1);
            expect(sessionStore.deletedSessionCutoffs[0]).toBeGreaterThanOrEqual(cutoffBefore);
            expect(sessionStore.deletedSessionCutoffs[0]).toBeLessThanOrEqual(Date.now());
            expect(sessionStore.savedSessions).toHaveLength(1);
            expect(sessionStore.deletedSessionIds).toEqual([
                sessionStore.savedSessions[0]!.id,
            ]);
            expect(contextHandle.stdout.read()).toBe(
                readFileDownloadSuccessOutput(downloadedFilePath),
            );
            await expect(Bun.file(downloadedFilePath).text()).resolves.toBe("hello");
        }
        finally {
            await rm(root, { force: true, recursive: true });
        }
    });

    test("uses the configured output directory when outDir is omitted", async () => {
        const root = await createTemporaryDirectory("download-command-settings");
        const outputDirectoryPath = join(root, "configured");
        const sessionStore = createDownloadSessionStoreSpy();
        const contextHandle = createDownloadContext({
            cwd: root,
            fetcher: async () => new Response("config", {
                headers: {
                    "Content-Disposition": "attachment; filename=\"configured.txt\"",
                    "Content-Length": "6",
                    "Content-Type": "text/plain",
                },
                status: 200,
            }),
            fileDownloadSessionStore: sessionStore.store,
            settings: {
                file: {
                    download: {
                        out_dir: outputDirectoryPath,
                    },
                },
            },
        });

        try {
            await downloadHandler({
                url: "https://example.com/files/configured.txt",
            }, contextHandle.context);

            const downloadedFilePath = join(outputDirectoryPath, "configured.txt");

            expect(contextHandle.stdout.read()).toBe(
                readFileDownloadSuccessOutput(downloadedFilePath),
            );
            await expect(Bun.file(downloadedFilePath).text()).resolves.toBe("config");
            expect(sessionStore.savedSessions).toHaveLength(1);
        }
        finally {
            await rm(root, { force: true, recursive: true });
        }
    });

    test("finalizes a complete temporary file without issuing a new request", async () => {
        const root = await createTemporaryDirectory("download-command-finalize");
        const outputDirectoryPath = join(root, "downloads");
        const tempFilePath = join(outputDirectoryPath, "report.oodownload");
        const session = createDownloadSessionRecordFixture({
            id: "session-complete",
            outDirPath: outputDirectoryPath,
            requestUrl: "https://example.com/files/report.txt",
            tempFileName: "report.oodownload",
            totalBytes: 4,
        });
        const sessionStore = createDownloadSessionStoreSpy(session);
        let fetchCount = 0;
        const contextHandle = createDownloadContext({
            cwd: root,
            fetcher: async () => {
                fetchCount += 1;
                return new Response("unexpected", {
                    status: 200,
                });
            },
            fileDownloadSessionStore: sessionStore.store,
            settings: {},
        });

        try {
            await Bun.write(tempFilePath, "done");

            await downloadHandler({
                outDir: outputDirectoryPath,
                url: session.requestUrl,
            }, contextHandle.context);

            const downloadedFilePath = join(outputDirectoryPath, "report.txt");

            expect(fetchCount).toBe(0);
            expect(sessionStore.savedSessions).toHaveLength(0);
            expect(sessionStore.deletedSessionIds).toEqual([
                "session-complete",
            ]);
            expect(contextHandle.stdout.read()).toBe(
                readFileDownloadSuccessOutput(downloadedFilePath),
            );
            await expect(Bun.file(downloadedFilePath).text()).resolves.toBe("done");
            await expect(lstat(tempFilePath)).rejects.toThrow();
        }
        finally {
            await rm(root, { force: true, recursive: true });
        }
    });

    test("preserves the partial download when the written size does not match the expected total", async () => {
        const root = await createTemporaryDirectory("download-command-size-check");
        const outputDirectoryPath = join(root, "downloads");
        const sessionStore = createDownloadSessionStoreSpy();
        const contextHandle = createDownloadContext({
            cwd: root,
            fetcher: async () => new Response("abc", {
                headers: {
                    "Content-Disposition": "attachment; filename=\"report.txt\"",
                    "Content-Length": "4",
                    "Content-Type": "text/plain",
                },
                status: 200,
            }),
            fileDownloadSessionStore: sessionStore.store,
            settings: {},
        });

        try {
            const error = await expectCliUserError(Promise.resolve(downloadHandler({
                outDir: outputDirectoryPath,
                url: "https://example.com/files/report.txt",
            }, contextHandle.context)));
            const savedSession = sessionStore.savedSessions[0]!;
            const tempFilePath = join(outputDirectoryPath, savedSession.tempFileName);

            expect(error.key).toBe("errors.fileDownload.downloadFailed");
            expect(error.params).toEqual({
                message: "Expected 4 bytes but found 3.",
                path: tempFilePath,
            });
            expect(sessionStore.savedSessions).toHaveLength(1);
            expect(sessionStore.deletedSessionIds).toEqual([]);
            expect(contextHandle.stdout.read()).toBe("");
            await expect(Bun.file(tempFilePath).text()).resolves.toBe("abc");
            await expect(lstat(join(outputDirectoryPath, "report.txt"))).rejects.toThrow();
        }
        finally {
            await rm(root, { force: true, recursive: true });
        }
    });
});

function createDownloadContext(options: {
    cwd: string;
    fetcher: Fetcher;
    fileDownloadSessionStore: CliExecutionContext["fileDownloadSessionStore"];
    settings: AppSettings;
}): {
    context: CliExecutionContext;
    stderr: ReturnType<typeof createTextBuffer>;
    stdout: ReturnType<typeof createTextBuffer>;
} {
    const stdout = createTextBuffer();
    const stderr = createTextBuffer();

    return {
        context: {
            authStore: createAuthStore(emptyAuthFile),
            cacheStore: createCacheStore(),
            completionRenderer: {
                render: () => "",
            },
            catalog: emptyCatalog,
            currentLogFilePath: "",
            cwd: options.cwd,
            env: {
                HOME: options.cwd,
            },
            fetcher: options.fetcher,
            fileDownloadSessionStore: options.fileDownloadSessionStore,
            fileUploadStore: createNoopFileUploadStore(),
            logger: pino({
                enabled: false,
            }),
            packageName: "@oomol-lab/oo-cli",
            settingsStore: createSettingsStore(options.settings),
            stderr: stderr.writer,
            stdin,
            stdout: stdout.writer,
            translator: createTranslator("en"),
            version: "0.1.0",
        },
        stderr,
        stdout,
    };
}
