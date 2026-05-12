import type { NpmCommandResult, NpmPackageMetadata } from "./npm-publish.ts";
import { chmod, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
