import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../__tests__/helpers.ts";
import { writeReleaseBundleBinaryFixture } from "./__tests__/helpers.ts";
import {
    buildReleaseBundleLatestMetadata,
    createGitHubReleaseBundle,
    releaseBundleFileName,
    releaseBundleLatestFileName,
    resolveReleaseBundleTargetDirectory,
} from "./release-bundle.ts";

describe("release bundle", () => {
    test("builds a GitHub release archive with the expected directory layout", async () => {
        const rootDirectoryPath = await createTemporaryDirectory("oo-release-bundle");
        const extractDirectoryPath = await createTemporaryDirectory("oo-release-bundle-extract");
        const outDirectoryPath = join(rootDirectoryPath, "dist");
        const stagingDirectoryPath = join(rootDirectoryPath, ".packages");
        const releaseVersion = "1.2.3";
        const targets = [
            { id: "darwin-arm64", executableFileName: "oo" },
            { id: "darwin-x64", executableFileName: "oo" },
            { id: "linux-arm64-gnu", executableFileName: "oo" },
            { id: "linux-arm64-musl", executableFileName: "oo" },
            { id: "linux-x64-gnu", executableFileName: "oo" },
            { id: "linux-x64-musl", executableFileName: "oo" },
            { id: "win32-arm64", executableFileName: "oo.exe" },
            { id: "win32-x64", executableFileName: "oo.exe" },
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

            const archivePath = await createGitHubReleaseBundle({
                outDir: outDirectoryPath,
                releaseVersion,
                stagingDir: stagingDirectoryPath,
                targets,
            });

            expect(archivePath).toBe(
                join(outDirectoryPath, releaseBundleFileName),
            );

            const archive = new Bun.Archive(await Bun.file(archivePath).bytes());
            await archive.extract(extractDirectoryPath);

            expect(
                await readFile(join(extractDirectoryPath, releaseBundleLatestFileName), "utf8"),
            ).toBe(buildReleaseBundleLatestMetadata(releaseVersion));

            for (const target of targets) {
                expect(
                    await readFile(
                        join(
                            extractDirectoryPath,
                            releaseVersion,
                            resolveReleaseBundleTargetDirectory(target.id),
                            target.executableFileName,
                        ),
                        "utf8",
                    ),
                ).toBe(`${target.id}\n`);
            }
        }
        finally {
            await Promise.all([
                rm(rootDirectoryPath, { force: true, recursive: true }),
                rm(extractDirectoryPath, { force: true, recursive: true }),
            ]);
        }
    });

    test("maps release bundle directories to the requested platform names", () => {
        expect(resolveReleaseBundleTargetDirectory("linux-arm64-gnu")).toBe("linux-arm64");
        expect(resolveReleaseBundleTargetDirectory("linux-x64-gnu")).toBe("linux-x64");
        expect(resolveReleaseBundleTargetDirectory("linux-arm64-musl")).toBe("linux-arm64-musl");
        expect(resolveReleaseBundleTargetDirectory("win32-x64")).toBe("win32-x64");
    });

    test("rejects unsupported release bundle targets", () => {
        expect(() => resolveReleaseBundleTargetDirectory("linux-ppc64")).toThrow(
            "Unsupported release bundle target: linux-ppc64",
        );
    });

    test("rejects an empty release version", () => {
        expect(() => buildReleaseBundleLatestMetadata("")).toThrow("RELEASE_VERSION is required.");
    });
});
