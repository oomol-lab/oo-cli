import type { BuildTargetPreset } from "./npm-packages.ts";

import process from "node:process";
import {
    resolveBuildTargetIdsForPreset,
    stagePlatformReleasePackages,
} from "./npm-packages.ts";

const preset = parseBuildTargetPreset(process.argv[2]);

await stagePlatformReleasePackages({
    outDir: process.env.BUILD_DIST_DIR ?? "dist",
    packageManifestPath: process.env.PACKAGE_JSON_PATH,
    releaseVersion: process.env.BUILD_VERSION,
    rootDir: process.cwd(),
    targetIds: resolveBuildTargetIdsForPreset(preset),
});

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
