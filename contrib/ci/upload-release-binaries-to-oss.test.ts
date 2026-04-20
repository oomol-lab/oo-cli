import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../__tests__/helpers.ts";
import { writeReleaseBundleBinaryFixture } from "./__tests__/helpers.ts";
import { createGitHubReleaseBundle, releaseBundleLatestFileName } from "./release-bundle.ts";
import {
    buildOssUri,
    buildReleaseDownloadCommand,
    formatGitHubOutput,
    normalizeReleaseVersion,
    prepareReleaseBundleUpload,
} from "./upload-release-binaries-to-oss.ts";

describe("upload-release-binaries-to-oss", () => {
    test("normalizes release versions with or without a v prefix", () => {
        expect(normalizeReleaseVersion("1.2.3")).toEqual({
            releaseTag: "v1.2.3",
            releaseVersion: "1.2.3",
        });
        expect(normalizeReleaseVersion("v1.2.3")).toEqual({
            releaseTag: "v1.2.3",
            releaseVersion: "1.2.3",
        });
    });

    test("builds the gh release download command", () => {
        expect(
            buildReleaseDownloadCommand({
                archiveDirectory: "dist",
                archiveName: "oo-binaries.tgz",
                releaseTag: "v1.2.3",
                sourceRepository: "oomol-lab/oo-cli",
            }),
        ).toEqual([
            "gh",
            "release",
            "download",
            "v1.2.3",
            "--repo",
            "oomol-lab/oo-cli",
            "--pattern",
            "oo-binaries.tgz",
            "--dir",
            "dist",
            "--clobber",
        ]);
    });

    test("prepares the extracted release bundle for OSS upload", async () => {
        const rootDirectoryPath = await createTemporaryDirectory("oo-release-upload");
        const archivePath = join(rootDirectoryPath, "dist", "oo-binaries.tgz");
        const extractDirectoryPath = join(rootDirectoryPath, "extract");
        const stagingDirectoryPath = join(rootDirectoryPath, "staging");
        const uploadDirectoryPath = join(rootDirectoryPath, "upload");
        const releaseVersion = "1.2.3";
        const targets = [
            { id: "darwin-arm64", executableFileName: "oo" },
            { id: "linux-x64-gnu", executableFileName: "oo" },
        ] as const;

        try {
            await Promise.all(
                targets.map(target =>
                    writeReleaseBundleBinaryFixture(
                        stagingDirectoryPath,
                        target.id,
                        target.executableFileName,
                    ),
                ),
            );
            await createGitHubReleaseBundle({
                outDir: join(rootDirectoryPath, "dist"),
                releaseVersion,
                stagingDir: stagingDirectoryPath,
                targets,
            });

            const result = await prepareReleaseBundleUpload({
                archivePath,
                extractDir: extractDirectoryPath,
                ossBucket: "oomol-static-cn-prod",
                ossPrefix: "release/apps/oo-cli/",
                uploadDir: uploadDirectoryPath,
                version: "v1.2.3",
            });

            expect(result).toEqual({
                ossUri: "oss:oomol-static-cn-prod/release/apps/oo-cli",
                releaseTag: "v1.2.3",
                releaseVersion: "1.2.3",
                uploadRoot: uploadDirectoryPath,
            });
            expect(
                await readFile(join(result.uploadRoot, releaseBundleLatestFileName), "utf8"),
            ).toBe("{\n  \"version\": \"1.2.3\"\n}\n");
            expect(
                await readFile(join(result.uploadRoot, releaseVersion, "darwin-arm64", "oo"), "utf8"),
            ).toBe("darwin-arm64\n");
            expect(
                await readFile(join(result.uploadRoot, releaseVersion, "linux-x64", "oo"), "utf8"),
            ).toBe("linux-x64-gnu\n");
        }
        finally {
            await rm(rootDirectoryPath, { force: true, recursive: true });
        }
    });

    test("rejects release bundles whose latest version does not match", async () => {
        const rootDirectoryPath = await createTemporaryDirectory("oo-release-upload-mismatch");
        const archivePath = join(rootDirectoryPath, "dist", "oo-binaries.tgz");

        try {
            await mkdir(join(rootDirectoryPath, "dist"), { recursive: true });
            await writeFile(
                archivePath,
                await new Bun.Archive({
                    "1.2.3/darwin-arm64/oo": "darwin-arm64\n",
                    [releaseBundleLatestFileName]: "{\n  \"version\": \"9.9.9\"\n}\n",
                }, {
                    compress: "gzip",
                }).bytes(),
            );

            await expect(
                prepareReleaseBundleUpload({
                    archivePath,
                    extractDir: join(rootDirectoryPath, "extract"),
                    ossBucket: "oomol-static-cn-prod",
                    ossPrefix: "release/apps/oo-cli",
                    uploadDir: join(rootDirectoryPath, "upload"),
                    version: "1.2.3",
                }),
            ).rejects.toThrow(
                "release latest version 9.9.9 does not match 1.2.3",
            );
        }
        finally {
            await rm(rootDirectoryPath, { force: true, recursive: true });
        }
    });

    test("formats OSS outputs for GitHub Actions", () => {
        expect(
            formatGitHubOutput({
                ossUri: buildOssUri("oomol-static-cn-prod", "release/apps/oo-cli"),
                releaseTag: "v1.2.3",
                releaseVersion: "1.2.3",
                uploadRoot: "/tmp/upload",
            }),
        ).toBe(
            "oss_uri=oss:oomol-static-cn-prod/release/apps/oo-cli\n"
            + "release_tag=v1.2.3\n"
            + "release_version=1.2.3\n"
            + "upload_root=/tmp/upload\n",
        );
    });
});
