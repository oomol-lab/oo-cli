import type { NpmCommandResult, NpmPackageMetadata } from "./npm-publish.ts";
import { chmod, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

import { describe, expect, test } from "bun:test";
import {
    createTemporaryDirectory,
    joinPathEntries,
} from "../../__tests__/helpers.ts";
import {
    parseNpmPublishOrderFile,
    publishNpmPackagesFromOrderFile,
    readNpmPackageMetadata,
} from "./npm-publish.ts";

const packageMetadata = {
    name: "@scope/demo",
    version: "1.2.3",
} as const satisfies NpmPackageMetadata;

describe("npm publish workflow", () => {
    test("trims publish order lines without dropping paths that contain spaces", () => {
        expect(
            parseNpmPublishOrderFile(" dist/demo package.tgz \r\n\t\n dist/next.tgz\n"),
        ).toEqual([
            "dist/demo package.tgz",
            "dist/next.tgz",
        ]);
    });

    test("reads package metadata from an npm tarball", async () => {
        const temporaryDirectoryPath = await createTemporaryDirectory(
            "npm-publish-metadata",
        );
        const packageFilePath = join(temporaryDirectoryPath, "demo.tgz");

        try {
            await Bun.write(
                packageFilePath,
                await new Bun.Archive(
                    {
                        "package/package.json": `${JSON.stringify(packageMetadata)}\n`,
                    },
                    {
                        compress: "gzip",
                    },
                ).bytes(),
            );

            await expect(readNpmPackageMetadata(packageFilePath)).resolves.toEqual(
                packageMetadata,
            );
        }
        finally {
            await rm(temporaryDirectoryPath, { force: true, recursive: true });
        }
    });

    test("skips publishing a package version that already exists", async () => {
        await withPublishOrder(["dist/demo.tgz"], async (publishOrder) => {
            const logs: string[] = [];
            let publishCount = 0;

            await publishNpmPackagesFromOrderFile({
                publishOrderPath: publishOrder.filePath,
                logger: createLogger(logs),
                packageVersionExists: () => Promise.resolve(true),
                publishPackage: () => {
                    publishCount += 1;

                    return Promise.resolve(createCommandResult({}));
                },
                readPackageMetadata: () => Promise.resolve(packageMetadata),
            });

            expect(publishCount).toBe(0);
            expect(logs).toEqual([
                "Skipping @scope/demo@1.2.3: version already exists on npm.",
            ]);
        });
    });

    test("retries transient npm publish failures before succeeding", async () => {
        await withPublishOrder(["dist/demo.tgz"], async (publishOrder) => {
            const sleepDelays: number[] = [];
            let publishCount = 0;

            await publishNpmPackagesFromOrderFile({
                publishOrderPath: publishOrder.filePath,
                logger: createLogger([]),
                packageVersionExists: () => Promise.resolve(false),
                publishPackage: () => {
                    publishCount += 1;

                    if (publishCount === 1) {
                        return Promise.resolve(createCommandResult({
                            exitCode: 1,
                            stderr: [
                                "npm error code TLOG_CREATE_ENTRY_ERROR",
                                "npm error cause Invalid response body while trying to fetch https://rekor.sigstore.dev/api/v1/log/entries: aborted",
                            ].join("\n"),
                        }));
                    }

                    return Promise.resolve(createCommandResult({}));
                },
                readPackageMetadata: () => Promise.resolve(packageMetadata),
                retryDelayMs: 0,
                sleep: (delayMs) => {
                    sleepDelays.push(delayMs);
                },
            });

            expect(publishCount).toBe(2);
            expect(sleepDelays).toEqual([0]);
        });
    });

    test("publishes package files concurrently before the final package", async () => {
        await withPublishOrder([
            "dist/platform-a.tgz",
            "dist/platform-b.tgz",
            "dist/wrapper.tgz",
        ], async (publishOrder) => {
            const activePackageFiles = new Set<string>();
            const publishCompletions = new Map<string, (result: NpmCommandResult) => void>();
            const startedPackageFiles: string[] = [];
            const firstTwoPublishesStarted = Promise.withResolvers<void>();
            const finalPublishStarted = Promise.withResolvers<void>();
            let maxConcurrentPublishes = 0;

            const publishPromise = publishNpmPackagesFromOrderFile({
                publishOrderPath: publishOrder.filePath,
                logger: createLogger([]),
                packageVersionExists: () => Promise.resolve(false),
                publishConcurrency: 2,
                publishPackage: (packageFile) => {
                    startedPackageFiles.push(packageFile);
                    activePackageFiles.add(packageFile);
                    maxConcurrentPublishes = Math.max(
                        maxConcurrentPublishes,
                        activePackageFiles.size,
                    );

                    const publishCompletion = Promise.withResolvers<NpmCommandResult>();
                    publishCompletions.set(packageFile, publishCompletion.resolve);

                    if (startedPackageFiles.length === 2) {
                        firstTwoPublishesStarted.resolve(undefined);
                    }
                    if (packageFile === "dist/wrapper.tgz") {
                        finalPublishStarted.resolve(undefined);
                    }

                    return publishCompletion.promise.finally(() => {
                        activePackageFiles.delete(packageFile);
                    });
                },
                readPackageMetadata: packageFile => Promise.resolve(
                    readMetadataFixture(packageFile),
                ),
            });

            await firstTwoPublishesStarted.promise;

            expect(startedPackageFiles).toEqual([
                "dist/platform-a.tgz",
                "dist/platform-b.tgz",
            ]);
            expect(maxConcurrentPublishes).toBe(2);

            completePublish(publishCompletions, "dist/platform-a.tgz");
            completePublish(publishCompletions, "dist/platform-b.tgz");
            await finalPublishStarted.promise;

            expect(startedPackageFiles).toEqual([
                "dist/platform-a.tgz",
                "dist/platform-b.tgz",
                "dist/wrapper.tgz",
            ]);

            completePublish(publishCompletions, "dist/wrapper.tgz");
            await publishPromise;
        });
    });

    test("passes local tarballs to npm publish as absolute paths", async () => {
        await withPublishOrder(["dist/demo.tgz"], async (publishOrder) => {
            const binDirectory = await createTemporaryDirectory("npm-publish-bin");
            const npmArgsPath = join(binDirectory, "npm-args.txt");

            try {
                await writeNpmArgumentRecorder(binDirectory);

                await publishNpmPackagesFromOrderFile({
                    commandEnv: {
                        NPM_ARGS_PATH: npmArgsPath,
                        PATH: joinPathEntries([
                            binDirectory,
                            process.env.PATH ?? "",
                        ], process.platform),
                        Path: joinPathEntries([
                            binDirectory,
                            process.env.Path ?? process.env.PATH ?? "",
                        ], process.platform),
                    },
                    logger: createLogger([]),
                    packageVersionExists: () => Promise.resolve(false),
                    publishOrderPath: publishOrder.filePath,
                    readPackageMetadata: () => Promise.resolve(packageMetadata),
                });

                const recordedArgs = (await readFile(npmArgsPath, "utf8"))
                    .replaceAll("\r\n", "\n")
                    .split("\n");
                expect(recordedArgs).toEqual([
                    "publish",
                    resolve("dist/demo.tgz"),
                    "--access",
                    "public",
                    "",
                ]);
            }
            finally {
                await rm(binDirectory, { force: true, recursive: true });
            }
        });
    });

    test("treats a failed publish as successful when the package appears on npm", async () => {
        await withPublishOrder(["dist/demo.tgz"], async (publishOrder) => {
            const logs: string[] = [];
            let existenceCheckCount = 0;
            let publishCount = 0;

            await publishNpmPackagesFromOrderFile({
                publishOrderPath: publishOrder.filePath,
                logger: createLogger(logs),
                packageVersionExists: () => {
                    existenceCheckCount += 1;

                    return Promise.resolve(existenceCheckCount === 2);
                },
                publishPackage: () => {
                    publishCount += 1;

                    return Promise.resolve(createCommandResult({
                        exitCode: 1,
                        stderr: "npm error code TLOG_CREATE_ENTRY_ERROR",
                    }));
                },
                readPackageMetadata: () => Promise.resolve(packageMetadata),
                sleep: () => undefined,
            });

            expect(publishCount).toBe(1);
            expect(logs).toEqual([
                "Treating @scope/demo@1.2.3 as published after npm returned a failure because the version now exists.",
            ]);
        });
    });

    test("skips when npm publish reports an existing version despite a stale view result", async () => {
        await withPublishOrder(["dist/demo.tgz"], async (publishOrder) => {
            let publishCount = 0;

            await publishNpmPackagesFromOrderFile({
                publishOrderPath: publishOrder.filePath,
                logger: createLogger([]),
                packageVersionExists: () => Promise.resolve(false),
                publishPackage: () => {
                    publishCount += 1;

                    return Promise.resolve(createCommandResult({
                        exitCode: 1,
                        stderr: "npm error You cannot publish over the previously published versions: 1.2.3.",
                    }));
                },
                readPackageMetadata: () => Promise.resolve(packageMetadata),
                sleep: () => undefined,
            });

            expect(publishCount).toBe(1);
        });
    });

    test("does not retry permanent npm publish failures", async () => {
        await withPublishOrder(["dist/demo.tgz"], async (publishOrder) => {
            let publishCount = 0;
            let sleepCount = 0;

            await expect(
                publishNpmPackagesFromOrderFile({
                    publishOrderPath: publishOrder.filePath,
                    logger: createLogger([]),
                    packageVersionExists: () => Promise.resolve(false),
                    publishPackage: () => {
                        publishCount += 1;

                        return Promise.resolve(createCommandResult({
                            exitCode: 1,
                            stderr: "npm error code E403",
                        }));
                    },
                    readPackageMetadata: () => Promise.resolve(packageMetadata),
                    sleep: () => {
                        sleepCount += 1;
                    },
                }),
            ).rejects.toThrow("Failed to publish @scope/demo@1.2.3");

            expect(publishCount).toBe(1);
            expect(sleepCount).toBe(0);
        });
    });

    test("rejects invalid publish retry options", async () => {
        await withPublishOrder(["dist/demo.tgz"], async (publishOrder) => {
            const baseOptions = {
                publishOrderPath: publishOrder.filePath,
                logger: createLogger([]),
                packageVersionExists: () => Promise.resolve(false),
                publishPackage: () => Promise.resolve(createCommandResult({})),
                readPackageMetadata: () => Promise.resolve(packageMetadata),
            };

            await expect(
                publishNpmPackagesFromOrderFile({
                    ...baseOptions,
                    retryCount: 0,
                }),
            ).rejects.toThrow("retryCount must be a positive integer");

            await expect(
                publishNpmPackagesFromOrderFile({
                    ...baseOptions,
                    retryDelayMs: -10,
                }),
            ).rejects.toThrow("retryDelayMs must be a non-negative finite number");

            await expect(
                publishNpmPackagesFromOrderFile({
                    ...baseOptions,
                    publishConcurrency: 0,
                }),
            ).rejects.toThrow("publishConcurrency must be a positive integer");
        });
    });

    test("returns a timeout result when npm commands hang", async () => {
        await withPublishOrder(["dist/demo.tgz"], async (publishOrder) => {
            const binDirectory = await createTemporaryDirectory("npm-publish-timeout-bin");

            try {
                const npmPath = join(binDirectory, process.platform === "win32" ? "npm.cmd" : "npm");
                await writeFile(
                    npmPath,
                    process.platform === "win32"
                        ? [
                                "@echo off",
                                ":loop",
                                "goto loop",
                            ].join("\r\n")
                        : [
                                "#!/bin/sh",
                                "while :; do",
                                "  :",
                                "done",
                            ].join("\n"),
                );
                if (process.platform !== "win32") {
                    await chmod(npmPath, 0o755);
                }

                await expect(publishNpmPackagesFromOrderFile({
                    commandEnv: {
                        PATH: joinPathEntries([binDirectory], process.platform),
                        Path: joinPathEntries([binDirectory], process.platform),
                    },
                    logger: createLogger([]),
                    npmCommandTimeoutMs: 10,
                    packageVersionExists: () => Promise.resolve(false),
                    publishOrderPath: publishOrder.filePath,
                    readPackageMetadata: () => Promise.resolve(packageMetadata),
                    retryCount: 1,
                    retryDelayMs: 0,
                    sleep: () => undefined,
                })).rejects.toThrow("npm command timed out after 10ms.");
            }
            finally {
                await rm(binDirectory, { force: true, recursive: true });
            }
        });
    });
});

async function withPublishOrder(
    packageFiles: readonly string[],
    run: (publishOrder: { directoryPath: string; filePath: string }) => Promise<void>,
): Promise<void> {
    const publishOrder = await createPublishOrderFile(packageFiles);
    try {
        await run(publishOrder);
    }
    finally {
        await rm(publishOrder.directoryPath, { force: true, recursive: true });
    }
}

async function createPublishOrderFile(packageFiles: readonly string[]): Promise<{
    directoryPath: string;
    filePath: string;
}> {
    const directoryPath = await createTemporaryDirectory("npm-publish-order");
    const filePath = join(directoryPath, "npm-publish-order.txt");

    await Bun.write(filePath, `${packageFiles.join("\n")}\n`);

    return {
        directoryPath,
        filePath,
    };
}

function createLogger(logs: string[]): Pick<Console, "log"> {
    return {
        log: (message?: unknown) => {
            logs.push(String(message));
        },
    };
}

async function writeNpmArgumentRecorder(binDirectory: string): Promise<void> {
    const npmPath = join(binDirectory, process.platform === "win32" ? "npm.cmd" : "npm");
    await writeFile(
        npmPath,
        process.platform === "win32"
            ? [
                    "@echo off",
                    "break > \"%NPM_ARGS_PATH%\"",
                    ":loop",
                    "if \"%~1\"==\"\" goto done",
                    ">> \"%NPM_ARGS_PATH%\" echo %~1",
                    "shift",
                    "goto loop",
                    ":done",
                    "exit /b 0",
                ].join("\r\n")
            : [
                    "#!/bin/sh",
                    "printf '%s\\n' \"$@\" > \"$NPM_ARGS_PATH\"",
                ].join("\n"),
    );
    if (process.platform !== "win32") {
        await chmod(npmPath, 0o755);
    }
}

function completePublish(
    publishCompletions: Map<string, (result: NpmCommandResult) => void>,
    packageFile: string,
): void {
    const complete = publishCompletions.get(packageFile);
    if (complete === undefined) {
        throw new Error(`Missing publish completion for ${packageFile}.`);
    }

    complete(createCommandResult({}));
}

function createCommandResult(options: {
    exitCode?: number;
    stderr?: string;
    stdout?: string;
}): NpmCommandResult {
    return {
        exitCode: options.exitCode ?? 0,
        stderr: options.stderr ?? "",
        stdout: options.stdout ?? "",
    };
}

function readMetadataFixture(packageFile: string): NpmPackageMetadata {
    switch (packageFile) {
        case "dist/platform-a.tgz":
            return {
                name: "@scope/platform-a",
                version: "1.2.3",
            };
        case "dist/platform-b.tgz":
            return {
                name: "@scope/platform-b",
                version: "1.2.3",
            };
        case "dist/wrapper.tgz":
            return {
                name: "@scope/wrapper",
                version: "1.2.3",
            };
        default:
            throw new Error(`Unexpected package file: ${packageFile}.`);
    }
}
