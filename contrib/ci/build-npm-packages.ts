import process from "node:process";

import { buildNpmReleasePackages } from "./npm-packages.ts";

const rawTargetIds = process.env.BUILD_TARGETS ?? "";
const targetIds = rawTargetIds === ""
    ? undefined
    : rawTargetIds
            .split(",")
            .map(targetId => targetId.trim())
            .filter(targetId => targetId !== "");

await buildNpmReleasePackages({
    outDir: process.env.BUILD_DIST_DIR ?? "dist",
    packageManifestPath: process.env.PACKAGE_JSON_PATH,
    releaseVersion: process.env.BUILD_VERSION,
    rootDir: process.cwd(),
    targetIds,
});
