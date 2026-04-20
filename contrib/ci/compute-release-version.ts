import process from "node:process";

import { writeGitHubOutputText } from "./github-actions.ts";
import {
    computeReleaseVersion,
    formatGitHubOutput,
    readVersionBump,
} from "./release-version.ts";

export function listGitTags(): string[] {
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

export async function main(): Promise<void> {
    const tags = listGitTags();
    const releaseVersion = computeReleaseVersion({
        expectedVersion: process.env.EXPECTED_VERSION ?? "",
        versionBump: readVersionBump(process.env.VERSION_BUMP),
        tags,
    });
    const formattedOutput = formatGitHubOutput(releaseVersion);

    if (process.env.GITHUB_OUTPUT === undefined || process.env.GITHUB_OUTPUT === "") {
        process.stdout.write(JSON.stringify(releaseVersion, null, 2));
        process.stdout.write("\n");
        return;
    }

    await writeGitHubOutputText(formattedOutput);
}

if (import.meta.main) {
    await main();
}
