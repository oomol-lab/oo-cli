import process from "node:process";

import {
    assembleReleaseArtifacts,
    parseBuildTargetIds,
} from "./npm-packages.ts";
import { buildCreateReleaseCommand, preparePackageManifest } from "./release-steps.ts";

async function runPrepareManifest(): Promise<void> {
    const releaseVersion = readRequiredEnv("RELEASE_VERSION");
    const packageJsonPath = process.env.PACKAGE_JSON_PATH ?? "package.json";
    const packageManifest = await Bun.file(packageJsonPath).text();
    const nextManifest = preparePackageManifest(packageManifest, releaseVersion);
    await Bun.write(packageJsonPath, nextManifest);
}

async function runCreateGitHubRelease(assets: readonly string[]): Promise<void> {
    const command = buildCreateReleaseCommand({
        releaseTag: readRequiredEnv("RELEASE_TAG"),
        previousTag: process.env.PREVIOUS_TAG ?? "",
        target: readRequiredEnv("GITHUB_SHA"),
        assets,
    });

    const processResult = Bun.spawn(command, {
        cwd: process.cwd(),
        stderr: "inherit",
        stdout: "inherit",
        stdin: "ignore",
    });

    const exitCode = await processResult.exited;
    if (exitCode !== 0) {
        process.exit(exitCode);
    }
}

async function runAssembleReleaseArtifacts(): Promise<void> {
    const releaseVersion = readRequiredEnv("RELEASE_VERSION");
    const outDir = process.env.RELEASE_DIST_DIR ?? "dist";
    const targetIds = parseBuildTargetIds(process.env.BUILD_TARGETS ?? "");

    await assembleReleaseArtifacts({
        outDir,
        releaseVersion,
        targetIds,
    });
}

function readRequiredEnv(name: string): string {
    const value = process.env[name];
    if (value === undefined || value === "") {
        throw new Error(`${name} is required.`);
    }

    return value;
}

export async function main(args: readonly string[]): Promise<void> {
    const [command, ...commandArgs] = args;

    switch (command) {
        case "prepare-manifest":
            await runPrepareManifest();
            return;
        case "assemble-release-artifacts":
            await runAssembleReleaseArtifacts();
            return;
        case "create-github-release":
            await runCreateGitHubRelease(commandArgs);
            return;
        default:
            throw new Error(`Unsupported command: ${command ?? ""}`);
    }
}

if (import.meta.main) {
    await main(process.argv.slice(2));
}
