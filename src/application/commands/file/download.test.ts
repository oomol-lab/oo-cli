import type {
    CliCatalog,
    CliCommandContext,
    CliExecutionContext,
    Fetcher,
    InteractiveInput,
} from "../../contracts/cli.ts";
import type { AuthFile } from "../../schemas/auth.ts";
import type { AppSettings } from "../../schemas/settings.ts";

import { lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import pino from "pino";

import {
    createAuthStore,
    createCacheStore,
    createInMemoryConnectorStore,
    createNoopFileUploadStore,
    createSettingsStore,
    createTemporaryDirectory,
    createTextBuffer,
    readFileDownloadSuccessOutput,
} from "../../../../__tests__/helpers.ts";
import { SidecarFileDownloadSessionStore } from "../../../adapters/store/sidecar-file-download-session-store.ts";
import { createTranslator } from "../../../i18n/translator.ts";
import { createCommandOutput } from "../command-output.ts";
import { fileDownloadCommand } from "./download.ts";
import {
    createDownloadSessionRecordFixture,
    createDownloadSessionStoreSpy,
    expectCliUserError,
} from "./download/__tests__/helpers.ts";

const downloadHandler = fileDownloadCommand.handler!;
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
        try {
            await downloadHandler({
                outDir: outputDirectoryPath,
                url: "https://example.com/files/report.txt",
            }, contextHandle.context);

            const downloadedFilePath = join(outputDirectoryPath, "report.txt");

            expect(sessionStore.deletedSessionCutoffs).toHaveLength(0);
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

    test("completes the current download when session metadata writes fail", async () => {
        const root = await createTemporaryDirectory("download-command-metadata-failure");
        const outputDirectoryPath = join(root, "downloads");
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
            fileDownloadSessionStore: createFailingMetadataSessionStore(),
            settings: {},
        });

        try {
            await downloadHandler({
                outDir: outputDirectoryPath,
                url: "https://example.com/files/report.txt",
            }, contextHandle.context);

            const downloadedFilePath = join(outputDirectoryPath, "report.txt");

            expect(contextHandle.stdout.read()).toBe(
                readFileDownloadSuccessOutput(downloadedFilePath),
            );
            await expect(Bun.file(downloadedFilePath).text()).resolves.toBe("hello");
        }
        finally {
            await rm(root, { force: true, recursive: true });
        }
    });

    test("downloads the same URL concurrently into unique final files", async () => {
        const root = await createTemporaryDirectory("download-command-concurrent");
        const outputDirectoryPath = join(root, "downloads");
        const sessionDirectoryPath = join(root, "sessions");
        let activeRequests = 0;
        let maxActiveRequests = 0;

        try {
            const runDownload = async () => {
                const sessionStore = new SidecarFileDownloadSessionStore(sessionDirectoryPath);
                const contextHandle = createDownloadContext({
                    cwd: root,
                    fetcher: async () => {
                        activeRequests += 1;
                        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
                        await Bun.sleep(20);
                        activeRequests -= 1;

                        return new Response("payload", {
                            headers: {
                                "Content-Disposition": "attachment; filename=\"same.txt\"",
                                "Content-Length": "7",
                                "Content-Type": "text/plain",
                            },
                            status: 200,
                        });
                    },
                    fileDownloadSessionStore: sessionStore,
                    settings: {},
                });

                try {
                    await downloadHandler({
                        outDir: outputDirectoryPath,
                        url: "https://example.com/files/same.txt",
                    }, contextHandle.context);
                }
                finally {
                    sessionStore.close();
                }
            };

            const downloads: Promise<void>[] = [];

            for (let index = 0; index < 20; index += 1) {
                downloads.push(runDownload());
            }

            await Promise.all(downloads);

            const outputEntries = (await readdir(outputDirectoryPath)).sort();

            expect(maxActiveRequests).toBeGreaterThan(1);
            expect(outputEntries).toHaveLength(20);
            expect(outputEntries.every(entry => !entry.endsWith(".oodownload"))).toBeTrue();
            expect(outputEntries.every(entry => !entry.endsWith(".lock"))).toBeTrue();
            await Promise.all(outputEntries.map(async (entry) => {
                await expect(Bun.file(join(outputDirectoryPath, entry)).text())
                    .resolves
                    .toBe("payload");
            }));
        }
        finally {
            await rm(root, { force: true, recursive: true });
        }
    });
});

function createFailingMetadataSessionStore(): CliExecutionContext["fileDownloadSessionStore"] {
    return {
        close() {},
        deleteDownloadSession() {
            return Promise.reject(new Error("delete failed"));
        },
        deleteDownloadSessionsUpdatedBefore() {
            return Promise.reject(new Error("cleanup failed"));
        },
        findDownloadSession() {
            return Promise.resolve(undefined);
        },
        findDownloadSessions() {
            return Promise.resolve([]);
        },
        saveDownloadSession() {
            return Promise.reject(new Error("save failed"));
        },
    };
}

function createDownloadContext(options: {
    cwd: string;
    fetcher: Fetcher;
    fileDownloadSessionStore: CliExecutionContext["fileDownloadSessionStore"];
    settings: AppSettings;
}): {
    context: CliCommandContext;
    stderr: ReturnType<typeof createTextBuffer>;
    stdout: ReturnType<typeof createTextBuffer>;
} {
    const stdout = createTextBuffer();
    const stderr = createTextBuffer();

    return {
        context: {
            output: createCommandOutput(stdout.writer, {}, undefined),
            authStore: createAuthStore(emptyAuthFile),
            cacheStore: createCacheStore(),
            connectorStore: createInMemoryConnectorStore(),
            completionRenderer: {
                render: () => "",
            },
            catalog: emptyCatalog,
            currentLogFilePath: "",
            execPath: process.execPath,
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
