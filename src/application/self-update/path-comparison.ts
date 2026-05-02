import { readPathModule } from "./paths.ts";

export function isSamePath(options: {
    leftPath: string;
    platform: NodeJS.Platform;
    rightPath: string;
}): boolean {
    return normalizeComparablePath(options.leftPath, options.platform)
        === normalizeComparablePath(options.rightPath, options.platform);
}

export function isPathInsideDirectory(options: {
    candidatePath: string;
    directoryPath: string;
    platform: NodeJS.Platform;
}): boolean {
    const pathModule = readPathModule(options.platform);
    const comparableCandidatePath = normalizeComparablePath(
        options.candidatePath,
        options.platform,
    );
    const comparableDirectoryPath = normalizeComparablePath(
        options.directoryPath,
        options.platform,
    );
    const relativePath = pathModule.relative(
        comparableDirectoryPath,
        comparableCandidatePath,
    );

    return relativePath !== ""
        && relativePath !== "."
        && !relativePath.startsWith("..")
        && !pathModule.isAbsolute(relativePath);
}

function normalizeComparablePath(
    path: string,
    platform: NodeJS.Platform,
): string {
    const pathModule = readPathModule(platform);
    const normalizedPath = pathModule.normalize(path.trim());

    return platform === "win32"
        ? normalizedPath.toLowerCase()
        : normalizedPath;
}
