import { mkdir, readFile, realpath, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import { publishBundledSkillInstallation } from "./shared.ts";

describe("bundled skill publication", () => {
    test("publishes the bundled skill through a symlink-compatible path", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const canonicalSkillDirectoryPath = join(
            rootDirectory,
            "config",
            "skills",
            "oo",
        );
        const installedSkillDirectoryPath = join(
            rootDirectory,
            ".codex",
            "skills",
            "oo",
        );

        try {
            await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
                recursive: true,
            });
            await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), "skill\n");
            await Bun.write(
                join(canonicalSkillDirectoryPath, "agents", "openai.yaml"),
                "OOMOL\n",
            );

            const result = await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath,
            });

            expect(result).toEqual({
                mode: "symlink",
                path: installedSkillDirectoryPath,
            });
            expect(await readFile(join(installedSkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                "skill\n",
            );
            expect(await realpath(installedSkillDirectoryPath)).toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("falls back to copying when symlink creation fails", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const canonicalSkillDirectoryPath = join(
            rootDirectory,
            "config",
            "skills",
            "oo",
        );
        const installedSkillDirectoryPath = join(
            rootDirectory,
            ".codex",
            "skills",
            "oo",
        );

        try {
            await mkdir(join(canonicalSkillDirectoryPath, "agents"), {
                recursive: true,
            });
            await Bun.write(join(canonicalSkillDirectoryPath, "SKILL.md"), "skill\n");
            await Bun.write(
                join(canonicalSkillDirectoryPath, "agents", "openai.yaml"),
                "OOMOL\n",
            );

            const result = await publishBundledSkillInstallation(
                {
                    canonicalSkillDirectoryPath,
                    installedSkillDirectoryPath,
                },
                {
                    createDirectorySymlink: async () => false,
                },
            );

            expect(result).toEqual({
                mode: "copy",
                path: installedSkillDirectoryPath,
            });
            expect(await readFile(join(installedSkillDirectoryPath, "SKILL.md"), "utf8")).toBe(
                "skill\n",
            );
            expect(await realpath(installedSkillDirectoryPath)).not.toBe(
                await realpath(canonicalSkillDirectoryPath),
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });
});
