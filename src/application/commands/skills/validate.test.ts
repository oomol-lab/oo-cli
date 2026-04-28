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
                    "description: >-",
                    "  Use this skill for a valid workflow.",
                    "metadata:",
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

    test("accepts missing metadata title", async () => {
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

            await expect(validateSkillDirectory(skillDirectoryPath)).resolves.toEqual({});
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
                error: "Frontmatter metadata.title cannot be empty.",
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
});
