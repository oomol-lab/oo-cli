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

    test("rejects unsupported frontmatter keys", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-skills-validate");
        const skillDirectoryPath = join(rootDirectory, "invalid-skill");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await Bun.write(
                join(skillDirectoryPath, "SKILL.md"),
                [
                    "---",
                    "name: invalid-skill",
                    "description: Use this skill for an invalid workflow.",
                    "compatibility: Requires the oo CLI.",
                    "---",
                    "",
                ].join("\n"),
            );

            await expect(validateSkillDirectory(skillDirectoryPath)).resolves.toEqual({
                error: "Unsupported frontmatter key: compatibility.",
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
