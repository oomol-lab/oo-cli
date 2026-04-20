import { mkdirSync } from "node:fs";
import { join, posix } from "node:path";

import { ensureReleaseVersion } from "./release-version.ts";

interface ReleaseBundleTarget {
    executableFileName: string;
    id: string;
}

export const releaseBundleFileName = "oo-binaries.tgz";
export const releaseBundleLatestFileName = "latest.json";

const releaseTargetDirectoryById = {
    "darwin-arm64": "darwin-arm64",
    "darwin-x64": "darwin-x64",
    "linux-arm64-gnu": "linux-arm64",
    "linux-arm64-musl": "linux-arm64-musl",
    "linux-x64-gnu": "linux-x64",
    "linux-x64-musl": "linux-x64-musl",
    "win32-arm64": "win32-arm64",
    "win32-x64": "win32-x64",
} as const satisfies Record<string, string>;

export function buildReleaseBundleLatestMetadata(releaseVersion: string): string {
    ensureReleaseVersion(releaseVersion);

    return `${JSON.stringify({ version: releaseVersion }, null, 2)}\n`;
}

export async function createGitHubReleaseBundle(options: {
    outDir: string;
    releaseVersion: string;
    stagingDir: string;
    targets: readonly ReleaseBundleTarget[];
}): Promise<string> {
    const archiveEntries = await buildReleaseBundleArchiveEntries(options);
    const archivePath = join(options.outDir, releaseBundleFileName);
    const archiveBytes = await new Bun.Archive(archiveEntries, {
        compress: "gzip",
    }).bytes();

    mkdirSync(options.outDir, { recursive: true });
    await Bun.write(archivePath, archiveBytes);

    return archivePath;
}

export function resolveReleaseBundleTargetDirectory(targetId: string): string {
    if (!(targetId in releaseTargetDirectoryById)) {
        throw new Error(`Unsupported release bundle target: ${targetId}`);
    }

    return releaseTargetDirectoryById[targetId as keyof typeof releaseTargetDirectoryById];
}

async function buildReleaseBundleArchiveEntries(options: {
    releaseVersion: string;
    stagingDir: string;
    targets: readonly ReleaseBundleTarget[];
}): Promise<Record<string, string | Uint8Array>> {
    const targetEntries = await Promise.all(
        options.targets.map(async (target) => {
            const sourcePath = join(
                options.stagingDir,
                target.id,
                "bin",
                target.executableFileName,
            );
            const archivePath = posix.join(
                options.releaseVersion,
                resolveReleaseBundleTargetDirectory(target.id),
                target.executableFileName,
            );

            return [
                archivePath,
                await Bun.file(sourcePath).bytes(),
            ] as const;
        }),
    );

    return {
        [releaseBundleLatestFileName]: buildReleaseBundleLatestMetadata(options.releaseVersion),
        ...Object.fromEntries(targetEntries),
    };
}
