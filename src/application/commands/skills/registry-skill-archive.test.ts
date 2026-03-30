import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    extractRegistryPackageArchive,
    requireExtractedRegistrySkillDirectory,
} from "./registry-skill-archive.ts";

describe("registry skill archive", () => {
    test("extracts a package archive and locates the requested skill directory", async () => {
        const bytes = await new Bun.Archive(
            {
                "package/package/package.json": "{}\n",
                "package/package/skills/chatgpt/SKILL.md": "# ChatGPT\n",
                "package/package/skills/chatgpt/agents/openai.yaml": "agent\n",
            },
            {
                compress: "gzip",
            },
        ).bytes();
        const archive = await extractRegistryPackageArchive(bytes);

        try {
            await expect(
                requireExtractedRegistrySkillDirectory(archive, "chatgpt"),
            ).resolves.toContain(join("skills", "chatgpt"));
        }
        finally {
            await archive.cleanup();
        }
    });

    test("rejects an extracted skill directory when SKILL.md is missing", async () => {
        const bytes = await new Bun.Archive(
            {
                "package/package/skills/chatgpt/agents/openai.yaml": "agent\n",
            },
            {
                compress: "gzip",
            },
        ).bytes();
        const archive = await extractRegistryPackageArchive(bytes);

        try {
            await expect(
                requireExtractedRegistrySkillDirectory(archive, "chatgpt"),
            ).rejects.toThrow("errors.skills.install.invalidArchive");
        }
        finally {
            await archive.cleanup();
        }
    });
});
