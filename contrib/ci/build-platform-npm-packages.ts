import type { BuildTargetPreset } from "./npm-packages.ts";

import process from "node:process";
import {
    resolveBuildTargetIdsForPreset,
    stagePlatformReleasePackages,
} from "./npm-packages.ts";

export function resolveBuildReleaseVersionFromEnvironment(
    environment: NodeJS.ProcessEnv,
): string | undefined {
    return environment.RELEASE_VERSION ?? environment.BUILD_VERSION;
}

export async function main(
    args: readonly string[],
    environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
    const preset = parseBuildTargetPreset(args[0]);

    await stagePlatformReleasePackages({
        outDir: environment.BUILD_DIST_DIR ?? "dist",
        packageManifestPath: environment.PACKAGE_JSON_PATH,
        releaseVersion: resolveBuildReleaseVersionFromEnvironment(environment),
        rootDir: process.cwd(),
        targetIds: resolveBuildTargetIdsForPreset(preset),
    });
}

function parseBuildTargetPreset(value: string | undefined): BuildTargetPreset {
    switch (value) {
        case "current-platform":
        case "linux":
        case "macos":
        case "windows":
            return value;
        default:
            throw new Error(`Unsupported build preset: ${value ?? ""}`);
    }
}

if (import.meta.main) {
    await main(process.argv.slice(2));
}
