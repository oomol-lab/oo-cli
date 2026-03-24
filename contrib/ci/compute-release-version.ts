import type { ReleaseVersionResult } from "./release-version.ts";
import { appendFile } from "node:fs/promises";

import process from "node:process";
import {
    computeReleaseVersion,
    formatGitHubOutput,
    readVersionBump,

} from "./release-version.ts";

export async function listGitTags(): Promise<string[]> {
    const processResult = Bun.spawnSync(
        ["git", "tag", "-l", "v*", "--sort=-v:refname"],
        {
            cwd: process.cwd(),
            stderr: "pipe",
            stdout: "pipe",
        },
    );

    if (processResult.exitCode !== 0) {
        const stderr = processResult.stderr.toString().trim();
        throw new Error(stderr === "" ? "Failed to list git tags." : stderr);
    }

    return processResult.stdout
        .toString()
        .split("\n")
        .map(tag => tag.trim())
        .filter(tag => tag !== "");
}

export async function writeGitHubOutput(result: ReleaseVersionResult): Promise<void> {
    const githubOutputPath = process.env.GITHUB_OUTPUT;
    const formattedOutput = formatGitHubOutput(result);

    if (githubOutputPath === undefined || githubOutputPath === "") {
        process.stdout.write(JSON.stringify(result, null, 2));
        process.stdout.write("\n");
        return;
    }

    await appendFile(githubOutputPath, formattedOutput, "utf8");
}

export async function main(): Promise<void> {
    const tags = await listGitTags();
    const releaseVersion = computeReleaseVersion({
        expectedVersion: process.env.EXPECTED_VERSION ?? "",
        versionBump: readVersionBump(process.env.VERSION_BUMP),
        tags,
    });

    await writeGitHubOutput(releaseVersion);
}

if (import.meta.main) {
    await main();
}
