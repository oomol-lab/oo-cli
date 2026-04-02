import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import {
    directoryExists,
    fileExists,
    isBundledSkillInstallationCurrent,
    isBundledSkillInstallationCurrentFromMetadata,
    isManagedBundledSkillInstallation,
    readInstalledBundledSkillImplicitInvocation,
    readInstalledBundledSkillMetadata,
    readInstalledBundledSkillVersion,
    requireBundledSkillHomeDirectory,
    requireCodexHomeDirectory,
    writeInstalledBundledSkillMetadata,
} from "./bundled-skill-observation.ts";
import { getBundledSkillFiles } from "./embedded-assets.ts";

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

    test("reads bundled skill metadata and versions while treating missing or invalid files as undefined", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const skillDirectoryPath = join(rootDirectory, "skills", "oo");
        const metadataFilePath = join(skillDirectoryPath, ".oo-metadata.json");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });

            expect(await readInstalledBundledSkillMetadata(skillDirectoryPath)).toBeUndefined();
            expect(await readInstalledBundledSkillVersion(skillDirectoryPath)).toBeUndefined();

            await Bun.write(metadataFilePath, "not json");
            expect(await readInstalledBundledSkillMetadata(skillDirectoryPath)).toBeUndefined();
            expect(await readInstalledBundledSkillVersion(skillDirectoryPath)).toBeUndefined();

            await writeInstalledBundledSkillMetadata(skillDirectoryPath, {
                version: "1.2.3",
            });
            expect(await readInstalledBundledSkillMetadata(skillDirectoryPath)).toEqual({
                version: "1.2.3",
            });
            expect(await readInstalledBundledSkillVersion(skillDirectoryPath)).toBe("1.2.3");
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                "{\n  \"version\": \"1.2.3\"\n}\n",
            );
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("reads implicit invocation from the ownership file and managed state from metadata", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const skillDirectoryPath = join(rootDirectory, "skills", "oo");
        const metadataFilePath = join(skillDirectoryPath, ".oo-metadata.json");
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });

            expect(await readInstalledBundledSkillImplicitInvocation(skillDirectoryPath)).toBeUndefined();
            expect(await isManagedBundledSkillInstallation(skillDirectoryPath)).toBeFalse();

            await Bun.write(
                ownershipFilePath,
                [
                    "# OOMOL",
                    "policy:",
                    "  allow_implicit_invocation: false",
                    "",
                ].join("\n"),
            );

            expect(await readInstalledBundledSkillImplicitInvocation(skillDirectoryPath)).toBeFalse();
            expect(await isManagedBundledSkillInstallation(skillDirectoryPath)).toBeFalse();

            await Bun.write(metadataFilePath, "not json");
            expect(await isManagedBundledSkillInstallation(skillDirectoryPath)).toBeFalse();

            await writeInstalledBundledSkillMetadata(skillDirectoryPath, {
                version: "1.2.3",
            });
            expect(await isManagedBundledSkillInstallation(skillDirectoryPath)).toBeTrue();

            await Bun.write(
                ownershipFilePath,
                [
                    "interface:",
                    "  display_name: oo",
                    "  short_description: Custom skill",
                    "",
                ].join("\n"),
            );

            expect(await readInstalledBundledSkillImplicitInvocation(skillDirectoryPath)).toBeUndefined();
            expect(await isManagedBundledSkillInstallation(skillDirectoryPath)).toBeTrue();
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("evaluates current installations using the existing observation order and file facts", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const skillDirectoryPath = join(rootDirectory, "skills", "oo");
        const ownershipFilePath = join(skillDirectoryPath, "agents", "openai.yaml");

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });
            await Bun.write(
                ownershipFilePath,
                "policy:\n  allow_implicit_invocation: true\n",
            );

            expect(
                await isBundledSkillInstallationCurrent(
                    "oo",
                    skillDirectoryPath,
                    "1.2.3",
                ),
            ).toBeFalse();

            await writeInstalledBundledSkillMetadata(skillDirectoryPath, {
                version: "0.0.1",
            });
            expect(
                await isBundledSkillInstallationCurrent(
                    "oo",
                    skillDirectoryPath,
                    "1.2.3",
                ),
            ).toBeFalse();

            await writeInstalledBundledSkillMetadata(skillDirectoryPath, {
                version: "1.2.3",
            });
            expect(
                await isBundledSkillInstallationCurrent(
                    "oo",
                    skillDirectoryPath,
                    "1.2.3",
                ),
            ).toBeFalse();

            for (const file of getBundledSkillFiles("oo")) {
                const filePath = join(skillDirectoryPath, file.relativePath);

                await mkdir(join(filePath, ".."), { recursive: true });
                await Bun.write(filePath, await Bun.file(file.sourcePath).text());
            }

            expect(
                await isBundledSkillInstallationCurrent(
                    "oo",
                    skillDirectoryPath,
                    "1.2.3",
                ),
            ).toBeTrue();
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("evaluates current installations from preloaded metadata", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const skillDirectoryPath = join(rootDirectory, "skills", "oo");

        try {
            await mkdir(join(skillDirectoryPath, "agents"), { recursive: true });

            expect(
                await isBundledSkillInstallationCurrentFromMetadata(
                    "oo",
                    skillDirectoryPath,
                    undefined,
                    "1.2.3",
                ),
            ).toBeFalse();

            expect(
                await isBundledSkillInstallationCurrentFromMetadata(
                    "oo",
                    skillDirectoryPath,
                    { version: "1.2.3" },
                    "1.2.3",
                ),
            ).toBeFalse();

            for (const file of getBundledSkillFiles("oo")) {
                const filePath = join(skillDirectoryPath, file.relativePath);

                await mkdir(join(filePath, ".."), { recursive: true });
                await Bun.write(filePath, await Bun.file(file.sourcePath).text());
            }

            expect(
                await isBundledSkillInstallationCurrentFromMetadata(
                    "oo",
                    skillDirectoryPath,
                    { version: "1.2.3" },
                    "1.2.3",
                ),
            ).toBeTrue();
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("evaluates current Claude installations without an ownership file", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
        const skillDirectoryPath = join(rootDirectory, "skills", "oo");

        try {
            await mkdir(skillDirectoryPath, { recursive: true });
            await writeInstalledBundledSkillMetadata(skillDirectoryPath, {
                version: "1.2.3",
            });

            expect(
                await isBundledSkillInstallationCurrent(
                    "oo",
                    skillDirectoryPath,
                    "1.2.3",
                    "claude",
                ),
            ).toBeFalse();

            for (const file of getBundledSkillFiles("oo", "claude")) {
                const filePath = join(skillDirectoryPath, file.relativePath);

                await mkdir(join(filePath, ".."), { recursive: true });
                await Bun.write(filePath, await Bun.file(file.sourcePath).text());
            }

            expect(
                await isBundledSkillInstallationCurrent(
                    "oo",
                    skillDirectoryPath,
                    "1.2.3",
                    "claude",
                ),
            ).toBeTrue();
            expect(
                await readInstalledBundledSkillImplicitInvocation(
                    skillDirectoryPath,
                    "claude",
                ),
            ).toBeUndefined();
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
});
