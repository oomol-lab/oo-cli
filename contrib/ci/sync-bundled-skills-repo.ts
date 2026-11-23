import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";

import {
    availableBundledSkillNames,
    materializeBundledSkillToDirectory,
} from "../../src/application/commands/skills/embedded-assets.ts";
import { writeGitHubOutputText } from "./github-actions.ts";

export interface ExportedBundledSkill {
    readonly files: readonly string[];
    readonly skillName: string;
}

export interface SyncBundledSkillsOutput {
    readonly commitMessage: string;
    readonly releaseTag: string;
    readonly skills: readonly ExportedBundledSkill[];
}

export async function exportBundledSkillsToDirectory(
    targetSkillsDir: string,
): Promise<readonly ExportedBundledSkill[]> {
    const normalizedDir = targetSkillsDir.trim();
    if (normalizedDir === "") {
        throw new Error("Target skills directory is required.");
    }

    // Replace the skills directory wholesale so renamed or removed bundled
    // skills never linger in the mirrored repository, while leaving sibling
    // files (such as README.md and LICENSE) untouched.
    await rm(normalizedDir, { force: true, recursive: true });
    await mkdir(normalizedDir, { recursive: true });

    return Promise.all(
        availableBundledSkillNames.map(async (skillName) => {
            const files = await materializeBundledSkillToDirectory({
                agentName: "universal",
                skillName,
                targetSkillDirectoryPath: join(normalizedDir, skillName),
            });

            return {
                files,
                skillName,
            };
        }),
    );
}

export function normalizeReleaseTag(tag?: string): string {
    const normalized = tag?.trim() ?? "";

    for (const char of normalized) {
        if (char === " " || char === "\t" || char === "\r" || char === "\n") {
            throw new Error(`Invalid release tag: ${tag}`);
        }
    }

    return normalized;
}

export function buildSyncCommitMessage(tag?: string): string {
    const normalizedTag = normalizeReleaseTag(tag);
    if (normalizedTag === "") {
        return "chore(skills): sync bundled skills from oo-cli";
    }

    return `chore(skills): sync bundled skills from oo-cli ${normalizedTag}`;
}

export function formatSyncGitHubOutput(output: SyncBundledSkillsOutput): string {
    return [
        `commit_message=${output.commitMessage}`,
        `release_tag=${output.releaseTag}`,
        `skills=${output.skills.map(skill => skill.skillName).join(",")}`,
        "",
    ].join("\n");
}

export async function main(args: readonly string[]): Promise<void> {
    const { values } = parseArgs({
        allowPositionals: false,
        args: [...args],
        options: {
            "out-dir": {
                type: "string",
            },
            "tag": {
                type: "string",
            },
        },
        strict: true,
    });

    const outDir = values["out-dir"]?.trim() ?? "";
    if (outDir === "") {
        throw new Error("--out-dir is required.");
    }

    const releaseTag = normalizeReleaseTag(values.tag);
    const skills = await exportBundledSkillsToDirectory(outDir);

    await writeGitHubOutputText(formatSyncGitHubOutput({
        commitMessage: buildSyncCommitMessage(releaseTag),
        releaseTag,
        skills,
    }));
}

if (import.meta.main) {
    await main(process.argv.slice(2));
}
