import type { Logger } from "pino";

import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createLogCapture,
    createTemporaryDirectory,
} from "../../../../__tests__/helpers.ts";
import { removeLegacyCodexManagedSkills } from "./legacy-codex-cleanup.ts";

const bundledMetadata = { kind: "bundled", schemaVersion: 1, version: "1.2.3" };
const registryMetadata = {
    kind: "registry",
    packageName: "@scope/demo",
    schemaVersion: 1,
    version: "1.0.0",
};
const localMetadata = { kind: "local", schemaVersion: 1 };

describe("legacy codex managed skill cleanup", () => {
    test("removes oo-managed skills from the legacy Codex home while preserving local and unmanaged directories", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-codex");
        const configDirectoryPath = join(rootDirectory, "config");
        const settingsFilePath = join(configDirectoryPath, "settings.toml");
        const codexSkillsDirectoryPath = join(rootDirectory, ".codex", "skills");
        const bundledSkillPath = join(codexSkillsDirectoryPath, "oo");
        const registrySkillPath = join(codexSkillsDirectoryPath, "chatgpt");
        const localSkillPath = join(codexSkillsDirectoryPath, "mine");
        const unmanagedSkillPath = join(codexSkillsDirectoryPath, "custom");
        const logCapture = createLogCapture();

        try {
            await writeManagedSkill(bundledSkillPath, bundledMetadata);
            await writeManagedSkill(registrySkillPath, registryMetadata);
            await writeManagedSkill(localSkillPath, localMetadata);
            await writeUnmanagedSkill(unmanagedSkillPath);

            await removeLegacyCodexManagedSkills(
                createCleanupContext({
                    env: { HOME: rootDirectory, USERPROFILE: rootDirectory },
                    logger: logCapture.logger as unknown as Logger,
                    settingsFilePath,
                }),
            );

            await expect(stat(bundledSkillPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(registrySkillPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(localSkillPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
            await expect(stat(unmanagedSkillPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
        }
        finally {
            logCapture.close();
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("removes the orphaned canonical bundled codex storage while preserving other agents", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-codex");
        const configDirectoryPath = join(rootDirectory, "config");
        const settingsFilePath = join(configDirectoryPath, "settings.toml");
        const canonicalCodexPath = join(
            configDirectoryPath,
            "skills",
            "bundled",
            "codex",
        );
        const canonicalUniversalPath = join(
            configDirectoryPath,
            "skills",
            "bundled",
            "universal",
        );
        const logCapture = createLogCapture();

        try {
            await mkdir(join(canonicalCodexPath, "oo"), { recursive: true });
            await Bun.write(join(canonicalCodexPath, "oo", "SKILL.md"), "stale\n");
            await mkdir(join(canonicalUniversalPath, "oo"), { recursive: true });
            await Bun.write(join(canonicalUniversalPath, "oo", "SKILL.md"), "kept\n");

            await removeLegacyCodexManagedSkills(
                createCleanupContext({
                    env: { HOME: rootDirectory, USERPROFILE: rootDirectory },
                    logger: logCapture.logger as unknown as Logger,
                    settingsFilePath,
                }),
            );

            await expect(stat(canonicalCodexPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(canonicalUniversalPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
        }
        finally {
            logCapture.close();
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("honors the CODEX_HOME environment override and leaves the default home untouched", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-codex");
        const configDirectoryPath = join(rootDirectory, "config");
        const settingsFilePath = join(configDirectoryPath, "settings.toml");
        const overrideCodexHome = join(rootDirectory, "custom-codex");
        const overrideSkillPath = join(overrideCodexHome, "skills", "oo");
        const defaultSkillPath = join(rootDirectory, ".codex", "skills", "oo");
        const logCapture = createLogCapture();

        try {
            await writeManagedSkill(overrideSkillPath, bundledMetadata);
            await writeManagedSkill(defaultSkillPath, bundledMetadata);

            await removeLegacyCodexManagedSkills(
                createCleanupContext({
                    env: {
                        CODEX_HOME: overrideCodexHome,
                        HOME: rootDirectory,
                        USERPROFILE: rootDirectory,
                    },
                    logger: logCapture.logger as unknown as Logger,
                    settingsFilePath,
                }),
            );

            await expect(stat(overrideSkillPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(defaultSkillPath)).resolves.toMatchObject({
                isDirectory: expect.any(Function),
            });
        }
        finally {
            logCapture.close();
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("is a silent no-op when there is nothing to clean up", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-codex");
        const configDirectoryPath = join(rootDirectory, "config");
        const settingsFilePath = join(configDirectoryPath, "settings.toml");
        const logCapture = createLogCapture();

        try {
            await mkdir(configDirectoryPath, { recursive: true });

            await removeLegacyCodexManagedSkills(
                createCleanupContext({
                    env: { HOME: rootDirectory, USERPROFILE: rootDirectory },
                    logger: logCapture.logger as unknown as Logger,
                    settingsFilePath,
                }),
            );

            logCapture.close();
            expect(logCapture.read()).toBe("");
        }
        finally {
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });
});

async function writeManagedSkill(
    skillDirectoryPath: string,
    metadata: object,
): Promise<void> {
    await mkdir(skillDirectoryPath, { recursive: true });
    await Bun.write(join(skillDirectoryPath, "SKILL.md"), "skill\n");
    await Bun.write(
        join(skillDirectoryPath, ".oo-metadata.json"),
        JSON.stringify(metadata),
    );
}

async function writeUnmanagedSkill(skillDirectoryPath: string): Promise<void> {
    await mkdir(skillDirectoryPath, { recursive: true });
    await Bun.write(join(skillDirectoryPath, "SKILL.md"), "user authored\n");
}

function createCleanupContext(options: {
    env: Record<string, string | undefined>;
    logger: Logger;
    settingsFilePath: string;
}): Parameters<typeof removeLegacyCodexManagedSkills>[0] {
    return {
        env: options.env,
        logger: options.logger,
        settingsStore: {
            getFilePath: () => options.settingsFilePath,
        } as never,
    };
}
