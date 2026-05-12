import type { NpmCommandResult, NpmPackageMetadata } from "./npm-publish.ts";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { createTemporaryDirectory } from "../../__tests__/helpers.ts";
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
    test("parses publish order files without dropping paths that contain spaces", () => {
        expect(
            parseNpmPublishOrderFile("dist/demo package.tgz\r\ndist/next.tgz\n"),
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
        const publishOrder = await createPublishOrderFile(["dist/demo.tgz"]);
        const logs: string[] = [];
        let publishCount = 0;

        try {
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
        }
        finally {
            await rm(publishOrder.directoryPath, { force: true, recursive: true });
        }
    });

    test("retries transient npm publish failures before succeeding", async () => {
        const publishOrder = await createPublishOrderFile(["dist/demo.tgz"]);
        const sleepDelays: number[] = [];
        let publishCount = 0;

        try {
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
                retryDelayMs: 10,
                sleep: (delayMs) => {
                    sleepDelays.push(delayMs);
                },
            });

            expect(publishCount).toBe(2);
            expect(sleepDelays).toEqual([10]);
        }
        finally {
            await rm(publishOrder.directoryPath, { force: true, recursive: true });
        }
    });

    test("treats a failed publish as successful when the package appears on npm", async () => {
        const publishOrder = await createPublishOrderFile(["dist/demo.tgz"]);
        const logs: string[] = [];
        let existenceCheckCount = 0;
        let publishCount = 0;

        try {
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
        }
        finally {
            await rm(publishOrder.directoryPath, { force: true, recursive: true });
        }
    });

    test("skips when npm publish reports an existing version despite a stale view result", async () => {
        const publishOrder = await createPublishOrderFile(["dist/demo.tgz"]);
        let publishCount = 0;

        try {
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
        }
        finally {
            await rm(publishOrder.directoryPath, { force: true, recursive: true });
        }
    });

    test("does not retry permanent npm publish failures", async () => {
        const publishOrder = await createPublishOrderFile(["dist/demo.tgz"]);
        let publishCount = 0;
        let sleepCount = 0;

        try {
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
        }
        finally {
            await rm(publishOrder.directoryPath, { force: true, recursive: true });
        }
    });
});

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
