import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createCliSandbox, createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import { validateSkillDirectory } from "./validate.ts";

describe("skills validate command", () => {
    test("accepts a skill with valid frontmatter", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-validate");
        const skillDirectoryPath = join(rootDirectory, "valid-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: valid-skill",
                    "description: Use this skill for a valid workflow.",
                    "metadata:",
                    "  icon: ':lucide:wand:'",
                    "  title: Valid Skill",
                    "---",
                    "",
                    "# Valid Skill",
                    "",
                ].join("\n"),
            );

            await expect(validateSkillDirectory(skillDirectoryPath)).resolves.toEqual({});
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("accepts unsupported frontmatter keys and loose field values", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-validate");
        const skillDirectoryPath = join(rootDirectory, "loose-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: Loose Skill Name",
                    "description: Use this skill with <loose> wording.",
                    "compatibility: Requires the oo CLI.",
                    "metadata:",
                    "  icon: ':lucide:sparkles:'",
                    "  title: Loose Skill",
                    "---",
                    "",
                ].join("\n"),
            );

            await expect(validateSkillDirectory(skillDirectoryPath)).resolves.toEqual({});
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("warns about missing metadata icon and title", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-validate");
        const skillDirectoryPath = join(rootDirectory, "missing-title-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: missing-title-skill",
                    "description: Use this skill for a workflow.",
                    "---",
                    "",
                ].join("\n"),
            );

            await expect(validateSkillDirectory(skillDirectoryPath)).resolves.toEqual({
                warnings: [
                    "Warning: Frontmatter metadata.icon is missing.",
                    "Warning: Frontmatter metadata.title is missing.",
                ],
            });
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("explains that top-level icon and title do not satisfy display metadata", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-validate");
        const skillDirectoryPath = join(rootDirectory, "top-level-display-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: top-level-display-skill",
                    "description: Use this skill for a workflow.",
                    "icon: ':lucide:wand:'",
                    "title: Top Level Display Skill",
                    "---",
                    "",
                ].join("\n"),
            );

            await expect(validateSkillDirectory(skillDirectoryPath)).resolves.toEqual({
                warnings: [
                    "Warning: Frontmatter metadata.icon is missing. Top-level icon is not used as skill display metadata; move it to metadata.icon.",
                    "Warning: Frontmatter metadata.title is missing. Top-level title is not used as skill display metadata; move it to metadata.title.",
                ],
            });
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("warns about missing metadata icon only", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-validate");
        const skillDirectoryPath = join(rootDirectory, "missing-icon-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: missing-icon-skill",
                    "description: Use this skill for a workflow.",
                    "metadata:",
                    "  title: Missing Icon Skill",
                    "---",
                    "",
                ].join("\n"),
            );

            await expect(validateSkillDirectory(skillDirectoryPath)).resolves.toEqual({
                warnings: ["Warning: Frontmatter metadata.icon is missing."],
            });
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("rejects whitespace-only descriptions", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-validate");
        const skillDirectoryPath = join(rootDirectory, "empty-description-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: empty-description-skill",
                    "description: \"   \"",
                    "metadata:",
                    "  icon: ':lucide:wand:'",
                    "  title: Empty Description Skill",
                    "---",
                    "",
                ].join("\n"),
            );

            await expect(validateSkillDirectory(skillDirectoryPath)).resolves.toEqual({
                error: "Frontmatter must include a non-empty string description field.",
            });
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("rejects whitespace-only names", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-validate");
        const skillDirectoryPath = join(rootDirectory, "empty-name-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: \"   \"",
                    "description: Use this skill for a workflow.",
                    "metadata:",
                    "  icon: ':lucide:wand:'",
                    "  title: Empty Name Skill",
                    "---",
                    "",
                ].join("\n"),
            );

            await expect(validateSkillDirectory(skillDirectoryPath)).resolves.toEqual({
                error: "Frontmatter must include a non-empty string name field.",
            });
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("rejects non-object metadata", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-validate");
        const skillDirectoryPath = join(rootDirectory, "non-object-metadata-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: non-object-metadata-skill",
                    "description: Use this skill for a workflow.",
                    "metadata: invalid",
                    "---",
                    "",
                ].join("\n"),
            );

            await expect(validateSkillDirectory(skillDirectoryPath)).resolves.toEqual({
                error: "Frontmatter metadata must be an object.",
            });
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("rejects empty metadata icon", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-validate");
        const skillDirectoryPath = join(rootDirectory, "empty-icon-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: empty-icon-skill",
                    "description: Use this skill for a workflow.",
                    "metadata:",
                    "  icon: \"  \"",
                    "  title: Empty Icon Skill",
                    "---",
                    "",
                ].join("\n"),
            );

            await expect(validateSkillDirectory(skillDirectoryPath)).resolves.toEqual({
                error: "Frontmatter metadata.icon field must be a non-empty string if provided.",
            });
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("rejects empty metadata title", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-validate");
        const skillDirectoryPath = join(rootDirectory, "empty-title-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: empty-title-skill",
                    "description: Use this skill for a workflow.",
                    "metadata:",
                    "  title: \"\"",
                    "---",
                    "",
                ].join("\n"),
            );

            await expect(validateSkillDirectory(skillDirectoryPath)).resolves.toEqual({
                error: "Frontmatter metadata.title field must be a non-empty string if provided.",
            });
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("rejects whitespace-only metadata title", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-validate");
        const skillDirectoryPath = join(rootDirectory, "whitespace-title-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: whitespace-title-skill",
                    "description: Use this skill for a workflow.",
                    "metadata:",
                    "  title: \"   \"",
                    "---",
                    "",
                ].join("\n"),
            );

            await expect(validateSkillDirectory(skillDirectoryPath)).resolves.toEqual({
                error: "Frontmatter metadata.title field must be a non-empty string if provided.",
            });
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("rejects non-string metadata title", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-validate");
        const skillDirectoryPath = join(rootDirectory, "array-title-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: array-title-skill",
                    "description: Use this skill for a workflow.",
                    "metadata:",
                    "  title:",
                    "    - Array Title",
                    "---",
                    "",
                ].join("\n"),
            );

            await expect(validateSkillDirectory(skillDirectoryPath)).resolves.toEqual({
                error: "Frontmatter metadata.title field must be a non-empty string if provided.",
            });
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("prints a success message from the CLI", async () => {
        const sandbox = await createCliSandbox();
        const skillDirectoryPath = join(sandbox.cwd, "valid-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: valid-skill",
                    "description: Use this skill for a valid workflow.",
                    "metadata:",
                    "  icon: ':lucide:check:'",
                    "  title: Valid Skill",
                    "---",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(["skills", "validate", skillDirectoryPath]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(`Skill at ${skillDirectoryPath} is valid.\n`);
            expect(result.stderr).toBe("");
        }
        finally {
            await sandbox.cleanup();
        }
    });

    test("prints validation warnings to stderr from the CLI", async () => {
        const sandbox = await createCliSandbox();
        const skillDirectoryPath = join(sandbox.cwd, "warning-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: warning-skill",
                    "description: Use this skill with warnings.",
                    "---",
                    "",
                ].join("\n"),
            );

            const result = await sandbox.run(["skills", "validate", skillDirectoryPath]);

            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe(`Skill at ${skillDirectoryPath} is valid.\n`);
            expect(result.stderr).toBe(
                [
                    "Warning: Frontmatter metadata.icon is missing.",
                    "Warning: Frontmatter metadata.title is missing.",
                    "",
                ].join("\n"),
            );
        }
        finally {
            await sandbox.cleanup();
        }
    });
});
