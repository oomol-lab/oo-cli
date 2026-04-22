import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import {
    directoryExists,
    fileExists,
    isManagedBundledSkillInstallation,
    readInstalledBundledSkillMetadata,
    requireBundledSkillHomeDirectory,
    requireCodexHomeDirectory,
    writeInstalledBundledSkillMetadata,
} from "./bundled-skill-observation.ts";

describe("bundled skill observation", () => {
    test("reports directory and file existence from stat-backed wrappers", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const directoryPath = join(rootDirectory, "skill-directory");
        const filePath = join(rootDirectory, "skill-file.txt");

        try {
            await mkdir(directoryPath, { recursive: true });
            await Bun.write(filePath, "skill\n");

            expect(await directoryExists(directoryPath)).toBeTrue();
            expect(await directoryExists(filePath)).toBeFalse();
            expect(await directoryExists(join(rootDirectory, "missing"))).toBeFalse();

            expect(await fileExists(filePath)).toBeTrue();
            expect(await fileExists(directoryPath)).toBeFalse();
            expect(await fileExists(join(rootDirectory, "missing.txt"))).toBeFalse();
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("reads bundled skill metadata while treating missing or invalid files as undefined", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const skillDirectoryPath = join(rootDirectory, "skills", "oo");
        const metadataFilePath = join(skillDirectoryPath, ".oo-metadata.json");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });

            expect(await readInstalledBundledSkillMetadata(skillDirectoryPath)).toBeUndefined();

            await Bun.write(metadataFilePath, "not json");
            expect(await readInstalledBundledSkillMetadata(skillDirectoryPath)).toBeUndefined();

            await writeInstalledBundledSkillMetadata(skillDirectoryPath, {
                version: "1.2.3",
            });
            expect(await readInstalledBundledSkillMetadata(skillDirectoryPath)).toEqual({
                version: "1.2.3",
            });
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                "{\n  \"version\": \"1.2.3\"\n}\n",
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("reads managed state from metadata", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const skillDirectoryPath = join(rootDirectory, "skills", "oo");
        const metadataFilePath = join(skillDirectoryPath, ".oo-metadata.json");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            expect(await isManagedBundledSkillInstallation(skillDirectoryPath)).toBeFalse();

            await Bun.write(metadataFilePath, "not json");
            expect(await isManagedBundledSkillInstallation(skillDirectoryPath)).toBeFalse();

            await writeInstalledBundledSkillMetadata(skillDirectoryPath, {
                version: "1.2.3",
            });
            expect(await isManagedBundledSkillInstallation(skillDirectoryPath)).toBeTrue();
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("requires the resolved Codex home directory to exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const codexHomeDirectory = join(rootDirectory, ".codex");
        const env = {
            CODEX_HOME: codexHomeDirectory,
            HOME: rootDirectory,
        };

        try {
            await expect(requireCodexHomeDirectory({ env })).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.skills.codexNotInstalled",
            });

            await mkdir(codexHomeDirectory, { recursive: true });

            expect(await requireCodexHomeDirectory({ env })).toBe(codexHomeDirectory);
            expect((await stat(codexHomeDirectory)).isDirectory()).toBeTrue();
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("requires the resolved Claude home directory to exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const claudeHomeDirectory = join(rootDirectory, ".claude");
        const env = {
            HOME: rootDirectory,
        };

        try {
            await expect(
                requireBundledSkillHomeDirectory({ env }, "claude"),
            ).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.skills.claudeNotInstalled",
            });

            await mkdir(claudeHomeDirectory, { recursive: true });

            expect(await requireBundledSkillHomeDirectory({ env }, "claude")).toBe(
                claudeHomeDirectory,
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("requires the resolved OpenClaw home directory to exist", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const openClawHomeDirectory = join(rootDirectory, ".openclaw");
        const env = {
            HOME: rootDirectory,
        };

        try {
            await expect(
                requireBundledSkillHomeDirectory({ env }, "openclaw"),
            ).rejects.toMatchObject({
                exitCode: 1,
                key: "errors.skills.openclawNotInstalled",
            });

            await mkdir(openClawHomeDirectory, { recursive: true });

            expect(await requireBundledSkillHomeDirectory({ env }, "openclaw")).toBe(
                openClawHomeDirectory,
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });
});
