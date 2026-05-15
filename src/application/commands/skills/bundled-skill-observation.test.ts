import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { createTemporaryDirectory } from "../../../../__tests__/helpers.ts";
import {
    directoryExists,
    fileExists,
    isManagedBundledSkillInstallation,
    readInstalledBundledSkillMetadata,
    requireBundledSkillHomeDirectory,
    writeInstalledBundledSkillMetadata,
} from "./bundled-skill-observation.ts";
import {
    resolveBundledSkillHomeDirectory,
    resolveDeepSeekTuiHomeDirectory,
    resolveTraeCnHomeDirectory,
    resolveTraeHomeDirectory,
} from "./bundled-skill-paths.ts";
import {
    readManagedSkillAgent,
    supportedSkillAgents,
} from "./managed-skill-agents.ts";
import {
    createBundledSkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

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
            expect(await readInstalledBundledSkillMetadata(skillDirectoryPath)).toEqual(
                createBundledSkillMetadata("1.2.3"),
            );
            expect(await readFile(metadataFilePath, "utf8")).toBe(
                renderSkillMetadataJson(createBundledSkillMetadata("1.2.3")),
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

    test("requires resolved agent home directories to exist", async () => {
        for (const agent of supportedSkillAgents) {
            const rootDirectory = await createTemporaryDirectory("oo-bundled-skill");
            const homeDirectory = join(rootDirectory, agent.homeDirectoryName);
            const env = {
                HOME: rootDirectory,
            };

            try {
                await expect(
                    requireBundledSkillHomeDirectory({ env }, agent.name),
                ).rejects.toMatchObject({
                    exitCode: 1,
                    key: "errors.skills.agentNotInstalled",
                    params: {
                        agentName: agent.title,
                        path: homeDirectory,
                    },
                });

                await mkdir(homeDirectory, { recursive: true });

                expect(await requireBundledSkillHomeDirectory({ env }, agent.name)).toBe(
                    homeDirectory,
                );
            }
            finally {
                await rm(rootDirectory, { force: true, recursive: true });
            }
        }
    });

    test("resolves configured agent home environment overrides", () => {
        const env = {
            CODEX_HOME: "/tmp/custom-codex-home",
            HERMES_HOME: "/tmp/custom-hermes-home",
            HOME: "/tmp/user-home",
            OPENCLAW_HOME: "/tmp/custom-openclaw-home",
        };

        expect(resolveBundledSkillHomeDirectory(env, "codex")).toBe(
            "/tmp/custom-codex-home",
        );
        expect(resolveBundledSkillHomeDirectory(env, "hermes")).toBe(
            "/tmp/custom-hermes-home",
        );
        expect(resolveBundledSkillHomeDirectory(env, "openclaw")).toBe(
            "/tmp/custom-openclaw-home",
        );
        expect(resolveBundledSkillHomeDirectory(env, "deepseek-tui")).toBe(
            join("/tmp/user-home", readManagedSkillAgent("deepseek-tui").homeDirectoryName),
        );
        expect(resolveDeepSeekTuiHomeDirectory(env)).toBe(
            join("/tmp/user-home", ".deepseek"),
        );
        expect(resolveTraeHomeDirectory(env)).toBe(join("/tmp/user-home", ".trae"));
        expect(resolveTraeCnHomeDirectory(env)).toBe(
            join("/tmp/user-home", ".trae-cn"),
        );
    });
});
