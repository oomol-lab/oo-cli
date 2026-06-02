import type { Logger } from "pino";

import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    createLogCapture,
    createTemporaryDirectory,
} from "../../../../__tests__/helpers.ts";
import { removeLegacyGptImage2ManagedSkills } from "./legacy-gpt-image-2-cleanup.ts";

const gptImage2Metadata = {
    kind: "registry",
    packageName: "@alwaysmavs/gpt-image-2",
    schemaVersion: 1,
    version: "0.0.3",
};
const otherRegistryMetadata = {
    kind: "registry",
    packageName: "@alice/demo",
    schemaVersion: 1,
    version: "1.0.0",
};
const bundledMetadata = { kind: "bundled", schemaVersion: 1, version: "1.2.3" };
const localMetadata = { kind: "local", schemaVersion: 1 };

describe("legacy @alwaysmavs/gpt-image-2 managed skill cleanup", () => {
    test("removes oo-managed gpt-image-2 skills from AI agents while preserving other, local, and unmanaged skills", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-gpt-image-2");
        const configDirectoryPath = join(rootDirectory, "config");
        const settingsFilePath = join(configDirectoryPath, "settings.toml");
        const universalSkillsDirectoryPath = join(rootDirectory, ".agents", "skills");
        const gptImage2SkillPath = join(universalSkillsDirectoryPath, "gpt-image-2");
        const gptImage2EditSkillPath = join(universalSkillsDirectoryPath, "gpt-image-2-edit");
        const otherRegistrySkillPath = join(universalSkillsDirectoryPath, "demo");
        const bundledSkillPath = join(universalSkillsDirectoryPath, "oo");
        const localSkillPath = join(universalSkillsDirectoryPath, "mine");
        const unmanagedSkillPath = join(universalSkillsDirectoryPath, "custom");
        const logCapture = createLogCapture();

        try {
            await writeManagedSkill(gptImage2SkillPath, gptImage2Metadata);
            await writeManagedSkill(gptImage2EditSkillPath, gptImage2Metadata);
            await writeManagedSkill(otherRegistrySkillPath, otherRegistryMetadata);
            await writeManagedSkill(bundledSkillPath, bundledMetadata);
            await writeManagedSkill(localSkillPath, localMetadata);
            await writeUnmanagedSkill(unmanagedSkillPath);

            await removeLegacyGptImage2ManagedSkills(
                createCleanupContext({
                    env: { HOME: rootDirectory, USERPROFILE: rootDirectory },
                    logger: logCapture.logger as unknown as Logger,
                    settingsFilePath,
                }),
            );

            await expect(stat(gptImage2SkillPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            await expect(stat(gptImage2EditSkillPath)).rejects.toMatchObject({
                code: "ENOENT",
            });
            expect((await stat(otherRegistrySkillPath)).isDirectory()).toBe(true);
            expect((await stat(bundledSkillPath)).isDirectory()).toBe(true);
            expect((await stat(localSkillPath)).isDirectory()).toBe(true);
            expect((await stat(unmanagedSkillPath)).isDirectory()).toBe(true);
        }
        finally {
            logCapture.close();
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("removes the canonical registry sources for gpt-image-2 while preserving other packages", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-gpt-image-2");
        const configDirectoryPath = join(rootDirectory, "config");
        const settingsFilePath = join(configDirectoryPath, "settings.toml");
        const canonicalRegistryPath = join(configDirectoryPath, "skills", "registry");
        const canonicalGptImage2Path = join(canonicalRegistryPath, "gpt-image-2");
        const canonicalOtherPath = join(canonicalRegistryPath, "demo");
        const logCapture = createLogCapture();

        try {
            await writeManagedSkill(canonicalGptImage2Path, gptImage2Metadata);
            await writeManagedSkill(canonicalOtherPath, otherRegistryMetadata);

            await removeLegacyGptImage2ManagedSkills(
                createCleanupContext({
                    env: { HOME: rootDirectory, USERPROFILE: rootDirectory },
                    logger: logCapture.logger as unknown as Logger,
                    settingsFilePath,
                }),
            );

            await expect(stat(canonicalGptImage2Path)).rejects.toMatchObject({
                code: "ENOENT",
            });
            expect((await stat(canonicalOtherPath)).isDirectory()).toBe(true);
        }
        finally {
            logCapture.close();
            await rm(rootDirectory, { force: true, recursive: true });
        }
    });

    test("is a silent no-op when there is nothing to clean up", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-gpt-image-2");
        const configDirectoryPath = join(rootDirectory, "config");
        const settingsFilePath = join(configDirectoryPath, "settings.toml");
        const logCapture = createLogCapture();

        try {
            await mkdir(configDirectoryPath, { recursive: true });

            await removeLegacyGptImage2ManagedSkills(
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

    test("completes the canonical cleanup even when the host cleanup fails", async () => {
        const rootDirectory = await createTemporaryDirectory("oo-legacy-gpt-image-2");
        const configDirectoryPath = join(rootDirectory, "config");
        const settingsFilePath = join(configDirectoryPath, "settings.toml");
        const universalHomeDirectory = join(rootDirectory, ".agents");
        const universalSkillsPath = join(universalHomeDirectory, "skills");
        const canonicalGptImage2Path = join(
            configDirectoryPath,
            "skills",
            "registry",
            "gpt-image-2",
        );
        const logCapture = createLogCapture();

        try {
            // Make the universal skills path a file so readdir fails with a
            // non-ENOENT error, forcing the host-cleanup branch to reject.
            await mkdir(universalHomeDirectory, { recursive: true });
            await Bun.write(universalSkillsPath, "not a directory\n");
            await writeManagedSkill(canonicalGptImage2Path, gptImage2Metadata);

            await removeLegacyGptImage2ManagedSkills(
                createCleanupContext({
                    env: { HOME: rootDirectory, USERPROFILE: rootDirectory },
                    logger: logCapture.logger as unknown as Logger,
                    settingsFilePath,
                }),
            );

            // The host branch rejected, but the canonical branch must still have
            // run to completion (Promise.allSettled, not a fail-fast Promise.all).
            await expect(stat(canonicalGptImage2Path)).rejects.toMatchObject({
                code: "ENOENT",
            });

            logCapture.close();
            expect(logCapture.read()).toContain(
                "Legacy @alwaysmavs/gpt-image-2 managed skill cleanup failed.",
            );
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
}): Parameters<typeof removeLegacyGptImage2ManagedSkills>[0] {
    return {
        env: options.env,
        logger: options.logger,
        settingsStore: {
            getFilePath: () => options.settingsFilePath,
        } as never,
    };
}
