import type { SelfUpdateCommandResolutionResult } from "../contracts/self-update.ts";
import { realpath } from "node:fs/promises";
import { resolveCommandPathCandidates } from "./command-path.ts";
import { isSamePath } from "./path-comparison.ts";
import { readPathModule } from "./paths.ts";

export async function resolveSelfUpdateCommandResolution(options: {
    env: Record<string, string | undefined>;
    executablePath: string;
    pathExists?: (path: string) => Promise<boolean>;
    platform: NodeJS.Platform;
}): Promise<SelfUpdateCommandResolutionResult> {
    const pathModule = readPathModule(options.platform);
    const candidates = await resolveCommandPathCandidates({
        env: options.env,
        executableNames: [pathModule.basename(options.executablePath)],
        pathExists: options.pathExists,
        platform: options.platform,
    });
    const firstCandidate = candidates[0];

    if (firstCandidate === undefined) {
        return {
            status: "missing",
        };
    }

    if (await isSameExecutablePath({
        leftPath: firstCandidate.path,
        platform: options.platform,
        rightPath: options.executablePath,
    })) {
        return {
            status: "managed",
        };
    }

    return {
        path: firstCandidate.path,
        status: "shadowed",
    };
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
        readRealPath(options.leftPath),
        readRealPath(options.rightPath),
    ]);

    return isSamePath({
        leftPath: leftRealPath,
        platform: options.platform,
        rightPath: rightRealPath,
    });
}

async function readRealPath(path: string): Promise<string> {
    return await realpath(path).catch(() => path);
}
