import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

import { afterEach, describe, expect, test } from "bun:test";

import {
    availableBundledSkillNames,
    getBundledSkillFiles,
    readBundledSkillFileContent,
} from "../../src/application/commands/skills/embedded-assets.ts";
import {
    buildSyncCommitMessage,
    exportBundledSkillsToDirectory,
    formatSyncGitHubOutput,
    main,
    normalizeReleaseTag,
} from "./sync-bundled-skills-repo.ts";

const originalGitHubOutput = process.env.GITHUB_OUTPUT;
const tempDirs: string[] = [];

afterEach(async () => {
    if (originalGitHubOutput === undefined) {
        delete process.env.GITHUB_OUTPUT;
    }
    else {
        process.env.GITHUB_OUTPUT = originalGitHubOutput;
    }

    await Promise.all(
        tempDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })),
    );
});

describe("sync-bundled-skills-repo", () => {
    test("exports all bundled skills rendered for the universal agent and removes stale skills", async () => {
        const repoRoot = await createTempDirectory();
        const skillsDir = join(repoRoot, "skills");
        const readmePath = join(repoRoot, "README.md");
        const staleSkillDir = join(skillsDir, "obsolete-skill");

        await mkdir(staleSkillDir, { recursive: true });
        await Promise.all([
            writeFile(readmePath, "# oo-cli-skills\n", "utf8"),
            writeFile(join(staleSkillDir, "SKILL.md"), "stale\n", "utf8"),
        ]);

        const exported = await exportBundledSkillsToDirectory(skillsDir);

        expect(exported.map(item => item.skillName)).toEqual([...availableBundledSkillNames]);
        expect(await readFile(readmePath, "utf8")).toBe("# oo-cli-skills\n");

        const entries = (await readdir(skillsDir)).sort();
        expect(entries).toEqual([...availableBundledSkillNames].sort());

        for (const skillName of availableBundledSkillNames) {
            const expectedFiles = getBundledSkillFiles(skillName, "universal");

            for (const file of expectedFiles) {
                const writtenPath = join(skillsDir, skillName, file.relativePath);
                const actualContent = await readFile(writtenPath, "utf8");
                const expectedContent = await readBundledSkillFileContent(file);

                expect(actualContent).toBe(expectedContent);
                expect(actualContent).not.toContain("<!-- agentic:");
            }
        }
    });

    test("rejects an empty target skills directory", async () => {
        await expect(exportBundledSkillsToDirectory("   ")).rejects.toThrow(
            "Target skills directory is required.",
        );
    });

    test("builds commit messages with and without a release tag", () => {
        expect(buildSyncCommitMessage("v1.12.2")).toBe(
            "chore(skills): sync bundled skills from oo-cli v1.12.2",
        );
        expect(buildSyncCommitMessage("  v1.12.2  ")).toBe(
            "chore(skills): sync bundled skills from oo-cli v1.12.2",
        );
        expect(buildSyncCommitMessage("")).toBe(
            "chore(skills): sync bundled skills from oo-cli",
        );
        expect(buildSyncCommitMessage(undefined)).toBe(
            "chore(skills): sync bundled skills from oo-cli",
        );
    });

    test("rejects release tags containing whitespace or newlines", () => {
        expect(() => normalizeReleaseTag("v1.2.3\ninjected=true")).toThrow(
            "Invalid release tag:",
        );
        expect(() => normalizeReleaseTag("v1.2.3 beta")).toThrow(
            "Invalid release tag:",
        );
    });

    test("formats GitHub Actions output lines", () => {
        expect(formatSyncGitHubOutput({
            commitMessage: "chore(skills): sync bundled skills from oo-cli v1.12.2",
            releaseTag: "v1.12.2",
            skills: [
                { files: ["SKILL.md"], skillName: "oo" },
                { files: ["SKILL.md"], skillName: "oo-find-skills" },
            ],
        })).toBe([
            "commit_message=chore(skills): sync bundled skills from oo-cli v1.12.2",
            "release_tag=v1.12.2",
            "skills=oo,oo-find-skills",
            "",
        ].join("\n"));
    });

    test("runs CLI entrypoint and writes GitHub output", async () => {
        const tempRoot = await createTempDirectory();
        const outDir = join(tempRoot, "skills");
        const githubOutputPath = join(tempRoot, "github-output.txt");
        process.env.GITHUB_OUTPUT = githubOutputPath;

        await main(["--out-dir", outDir, "--tag", "v1.12.2"]);

        const githubOutput = await readFile(githubOutputPath, "utf8");
        expect(githubOutput).toBe([
            "commit_message=chore(skills): sync bundled skills from oo-cli v1.12.2",
            "release_tag=v1.12.2",
            `skills=${availableBundledSkillNames.join(",")}`,
            "",
        ].join("\n"));

        const entries = (await readdir(outDir)).sort();
        expect(entries).toEqual([...availableBundledSkillNames].sort());
    });

    test("rejects CLI invocation without --out-dir", async () => {
        await expect(main(["--tag", "v1.12.2"])).rejects.toThrow("--out-dir is required.");
    });
});

async function createTempDirectory(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "oo-cli-sync-skills-"));
    tempDirs.push(dir);
    return dir;
}
