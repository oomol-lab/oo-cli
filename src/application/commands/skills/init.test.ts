import { lstat, mkdir, readFile, realpath, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox } from "../../../../__tests__/helpers.ts";
import { resolveStorePaths } from "../../../adapters/store/store-path.ts";
import { APP_NAME } from "../../config/app-config.ts";
import {
    resolveClaudeHomeDirectory,
    resolveCodeBuddyHomeDirectory,
    resolveCodexHomeDirectory,
    resolveTraeCnHomeDirectory,
    resolveTraeHomeDirectory,
} from "./bundled-skill-paths.ts";
import { resolveLocalSkillCanonicalDirectoryPath } from "./managed-skill-paths.ts";
import {
    installedRegistrySkillCompatibility,
    renderOoPackageExecutionGuidance,
} from "./registry-skill-markdown.ts";

describe("skills init command", () => {
    test("initializes a local skill and publishes it to existing supported hosts", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codexHomeDirectory, "skills", "campaign-writer");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "campaign-writer",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "Campaign Writer",
                "--description",
                "Write campaign briefs using a known package workflow.",
                "--icon",
                ":lucide:wrench:",
                "--title",
                "Campaign Writer",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Initialized skill campaign-writer in canonical storage at ${canonicalSkillDirectoryPath}.`,
                    `Linked skill campaign-writer to ${skillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            expect(result.stderr).toBe("");
            expect(await realpath(skillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            await expect(
                stat(join(canonicalSkillDirectoryPath, ".oo-metadata.json")),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
            expect(
                await readFile(join(canonicalSkillDirectoryPath, "SKILL.md"), "utf8"),
            ).toBe([
                "---",
                "name: campaign-writer",
                "description: Write campaign briefs using a known package workflow.",
                `compatibility: ${installedRegistrySkillCompatibility}`,
                "metadata:",
                "  icon: \":lucide:wrench:\"",
                "  title: Campaign Writer",
                "---",
                "",
                "# Campaign Writer",
                "",
                renderOoPackageExecutionGuidance(),
                "",
                "TODO: Describe the workflow this skill should follow.",
                "",
            ].join("\n"));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("omits metadata title when no title is provided", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "minimal-skill",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "minimal-skill",
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(0);
            expect(
                await readFile(join(canonicalSkillDirectoryPath, "SKILL.md"), "utf8"),
            ).toBe([
                "---",
                "name: minimal-skill",
                "description: Use a known package workflow.",
                `compatibility: ${installedRegistrySkillCompatibility}`,
                "---",
                "",
                "# Minimal Skill",
                "",
                renderOoPackageExecutionGuidance(),
                "",
                "TODO: Describe the workflow this skill should follow.",
                "",
            ].join("\n"));
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("writes a long description as a single-line frontmatter string", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "gpt-image-2",
        );
        const description = "Generate new images or edit existing images with GPT Image 2. Use when the user asks for GPT text-to-image, image generation, image-to-image editing, replacing objects, preserving a person or product, or turning local reference images into edited PNG JPEG or WebP outputs.";

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "gpt-image-2",
                "--description",
                description,
            ]);

            expect(result.exitCode).toBe(0);

            const content = await readFile(
                join(canonicalSkillDirectoryPath, "SKILL.md"),
                "utf8",
            );

            expect(content).toContain(`description: ${description}`);
            expect(content).not.toContain("description: >-");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("initializes a local skill by copying for non-symlink hosts", async () => {
        const sandbox = await createCliSandbox();
        const codeBuddyHomeDirectory = resolveCodeBuddyHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(codeBuddyHomeDirectory, "skills", "copy-skill");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "copy-skill",
        );

        try {
            await mkdir(codeBuddyHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "copy-skill",
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Initialized skill copy-skill in canonical storage at ${canonicalSkillDirectoryPath}.`,
                    `Copied skill copy-skill to ${skillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            expect(await realpath(skillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("initializes a local skill by copying for Trae", async () => {
        const sandbox = await createCliSandbox();
        const traeHomeDirectory = resolveTraeHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(traeHomeDirectory, "skills", "trae-skill");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "trae-skill",
        );

        try {
            await mkdir(traeHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "trae-skill",
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Initialized skill trae-skill in canonical storage at ${canonicalSkillDirectoryPath}.`,
                    `Copied skill trae-skill to ${skillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            expect(await realpath(skillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("initializes a local skill by copying for Trae CN", async () => {
        const sandbox = await createCliSandbox();
        const traeCnHomeDirectory = resolveTraeCnHomeDirectory(sandbox.env);
        const skillDirectoryPath = join(traeCnHomeDirectory, "skills", "trae-cn-skill");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "trae-cn-skill",
        );

        try {
            await mkdir(traeCnHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "trae-cn-skill",
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Initialized skill trae-cn-skill in canonical storage at ${canonicalSkillDirectoryPath}.`,
                    `Copied skill trae-cn-skill to ${skillDirectoryPath}.`,
                    "",
                ].join("\n"),
            );
            expect(await realpath(skillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
            expect((await lstat(skillDirectoryPath)).isSymbolicLink()).toBeFalse();
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("requires a description before writing", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "missing-description",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "missing-description",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            expect(result.stderr).toBe(
                "Missing required --description. Provide a concise trigger description for the generated skill.\n",
            );
            await expect(
                stat(canonicalSkillDirectoryPath),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("fails before writing when the local canonical directory already exists", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "existing-skill",
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });
            await mkdir(canonicalSkillDirectoryPath, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                "existing-skill",
                "--description",
                "Use an existing package workflow.",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stderr).toContain("already occupied");
            await expect(
                stat(join(canonicalSkillDirectoryPath, "SKILL.md")),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("removes already published targets when a later target fails", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const claudeHomeDirectory = resolveClaudeHomeDirectory(sandbox.env);
        const codexSkillDirectoryPath = join(codexHomeDirectory, "skills", "rollback-skill");
        const claudePublishRootPath = join(claudeHomeDirectory, "skills");
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            "rollback-skill",
        );

        try {
            await Promise.all([
                mkdir(codexHomeDirectory, { recursive: true }),
                mkdir(claudeHomeDirectory, { recursive: true }),
            ]);
            await Bun.write(claudePublishRootPath, "not a directory");

            const result = await sandbox.run([
                "skills",
                "init",
                "rollback-skill",
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(1);
            expect(result.stdout).toBe("");
            await expect(
                stat(codexSkillDirectoryPath),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(
                stat(canonicalSkillDirectoryPath),
            ).rejects.toMatchObject({
                code: "ENOENT",
            });
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("does not leave a trailing hyphen after truncating the normalized name", async () => {
        const sandbox = await createCliSandbox();
        const codexHomeDirectory = resolveCodexHomeDirectory(sandbox.env);
        const normalizedSkillName = "a".repeat(63);
        const inputName = `${"A".repeat(63)} B`;
        const storePaths = resolveStorePaths({
            appName: APP_NAME,
            env: sandbox.env,
            platform: process.platform,
        });
        const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
            storePaths.settingsFilePath,
            normalizedSkillName,
        );

        try {
            await mkdir(codexHomeDirectory, { recursive: true });

            const result = await sandbox.run([
                "skills",
                "init",
                inputName,
                "--description",
                "Use a known package workflow.",
            ]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(
                [
                    `Initialized skill ${normalizedSkillName} in canonical storage at ${canonicalSkillDirectoryPath}.`,
                    `Linked skill ${normalizedSkillName} to ${join(codexHomeDirectory, "skills", normalizedSkillName)}.`,
                    "",
                ].join("\n"),
            );
            expect(
                await readFile(join(canonicalSkillDirectoryPath, "SKILL.md"), "utf8"),
            ).toContain(`name: ${normalizedSkillName}\n`);
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
