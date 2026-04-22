import process from "node:process";

import {
    resolveBuildTargetIdsForSelection,
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
    await stagePlatformReleasePackages({
        outDir: environment.BUILD_DIST_DIR ?? "dist",
        packageManifestPath: environment.PACKAGE_JSON_PATH,
        releaseVersion: resolveBuildReleaseVersionFromEnvironment(environment),
        rootDir: process.cwd(),
        targetIds: resolveBuildTargetIdsForSelection(args[0]),
    });
}

if (import.meta.main) {
    await main(process.argv.slice(2));
}
