import process from "node:process";

import {
    buildNpmReleasePackages,
    resolveCurrentPlatformTarget,
} from "./npm-packages.ts";

const currentTarget = resolveCurrentPlatformTarget();

await buildNpmReleasePackages({
    outDir: process.env.BUILD_DIST_DIR ?? "dist",
    packageManifestPath: process.env.PACKAGE_JSON_PATH,
    releaseVersion: process.env.BUILD_VERSION,
    rootDir: process.cwd(),
    targetIds: [currentTarget.id],
});
