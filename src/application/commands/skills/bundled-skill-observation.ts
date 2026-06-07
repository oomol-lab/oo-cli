import type { BundledSkillMetadata } from "./skill-metadata.ts";

import { readFile, stat } from "node:fs/promises";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import {
    parseBundledSkillMetadataContent,
} from "./bundled-skill-model.ts";
import {
    resolveBundledSkillMetadataFilePath,
} from "./bundled-skill-paths.ts";

import {
    createBundledSkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

export async function directoryExists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
}

export async function fileExists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
}

export async function isManagedBundledSkillInstallation(
    skillDirectoryPath: string,
): Promise<boolean> {
    return (await readInstalledBundledSkillMetadata(skillDirectoryPath)) !== undefined;
}

export async function readInstalledBundledSkillMetadata(
    skillDirectoryPath: string,
): Promise<BundledSkillMetadata | undefined> {
    try {
        const content = await readFile(
            resolveBundledSkillMetadataFilePath(skillDirectoryPath),
            "utf8",
        );

        return parseBundledSkillMetadataContent(content);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }
}

export async function writeInstalledBundledSkillMetadata(
    skillDirectoryPath: string,
    metadata: Pick<BundledSkillMetadata, "version">,
): Promise<void> {
    await Bun.write(
        resolveBundledSkillMetadataFilePath(skillDirectoryPath),
        renderSkillMetadataJson(createBundledSkillMetadata(metadata.version)),
    );
}
