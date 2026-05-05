import type { SelfUpdateCommandResolutionResult } from "../contracts/self-update.ts";
import { resolveCommandPathCandidates } from "./command-path.ts";
import { isSamePath, readRealPathOrFallback } from "./path-comparison.ts";
import { isExecutableDirectoryOnPath } from "./path-configuration.ts";
import { readPathModule } from "./paths.ts";

export async function resolveSelfUpdateCommandResolution(options: {
    env: Record<string, string | undefined>;
    executablePath: string;
    pathExists?: (path: string) => Promise<boolean>;
    platform: NodeJS.Platform;
}): Promise<SelfUpdateCommandResolutionResult> {
    const pathModule = readPathModule(options.platform);
    const executableDirectory = pathModule.dirname(options.executablePath);
    const candidates = await resolveCommandPathCandidates({
        env: options.env,
        executableNames: [pathModule.basename(options.executablePath)],
        pathExists: options.pathExists,
        platform: options.platform,
    });
    const firstCandidate = candidates[0];

    if (firstCandidate !== undefined && await isSameExecutablePath({
        leftPath: firstCandidate.path,
        platform: options.platform,
        rightPath: options.executablePath,
    })) {
        return { status: "managed" };
    }

    // Distinguish "PATH setup hasn't taken effect" from a true shadow:
    // when the managed directory is not on PATH yet, prefer
    // `managedDirectoryMissing` so the PATH setup note covers it instead.
    const managedDirectoryOnPath = isExecutableDirectoryOnPath(
        executableDirectory,
        options.env,
        options.platform,
    );

    if (!managedDirectoryOnPath) {
        return { status: "managedDirectoryMissing" };
    }

    return firstCandidate === undefined
        ? { status: "missing" }
        : { path: firstCandidate.path, status: "shadowed" };
}

async function isSameExecutablePath(options: {
    leftPath: string;
    platform: NodeJS.Platform;
    rightPath: string;
}): Promise<boolean> {
    if (isSamePath(options)) {
        return true;
    }

    const [leftRealPath, rightRealPath] = await Promise.all([
        readRealPathOrFallback(options.leftPath),
        readRealPathOrFallback(options.rightPath),
    ]);

    return isSamePath({
        leftPath: leftRealPath,
        platform: options.platform,
        rightPath: rightRealPath,
    });
}
