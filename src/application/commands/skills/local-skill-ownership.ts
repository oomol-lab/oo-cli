import type {
    LocalSkillMetadata,
    SkillMetadata,
} from "./skill-metadata.ts";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import { resolveManagedSkillMetadataFilePath } from "./managed-skill-paths.ts";
import {
    createLocalSkillMetadata,
    parseSkillMetadataContent,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

export async function readSkillFileContent(
    skillDirectoryPath: string,
): Promise<string | undefined> {
    try {
        return await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8");
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }
}

export async function hasMatchingSkillFileContent(options: {
    expectedContent: string;
    skillDirectoryPath: string;
}): Promise<boolean> {
    return await readSkillFileContent(options.skillDirectoryPath)
        === options.expectedContent;
}

export async function readSkillFileHash(
    skillDirectoryPath: string,
): Promise<string | undefined> {
    const content = await readSkillFileContent(skillDirectoryPath);

    if (content === undefined) {
        return undefined;
    }

    return createHash("sha256").update(content).digest("hex");
}

export async function hasMatchingSkillFileHash(options: {
    expectedHash: string;
    skillDirectoryPath: string;
}): Promise<boolean> {
    return await readSkillFileHash(options.skillDirectoryPath)
        === options.expectedHash;
}

export async function readSkillMetadataFileState(
    skillDirectoryPath: string,
): Promise<{
    exists: boolean;
    metadata: SkillMetadata | undefined;
}> {
    try {
        const content = await readFile(
            resolveManagedSkillMetadataFilePath(skillDirectoryPath),
            "utf8",
        );

        return {
            exists: true,
            metadata: parseSkillMetadataContent(content),
        };
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return {
                exists: false,
                metadata: undefined,
            };
        }

        throw error;
    }
}

export async function readLocalSkillMetadata(
    skillDirectoryPath: string,
): Promise<LocalSkillMetadata | undefined> {
    const metadata = (await readSkillMetadataFileState(skillDirectoryPath)).metadata;

    return metadata?.kind === "local" ? metadata : undefined;
}

// True when the metadata at the target identifies an oo-managed source
// other than a local skill (bundled, registry, or a metadata file present
// but unparseable).
export function isForeignManagedMetadataState(state: {
    exists: boolean;
    metadata: SkillMetadata | undefined;
}): boolean {
    return state.metadata?.kind === "bundled"
        || state.metadata?.kind === "registry"
        || (state.exists && state.metadata === undefined);
}

export async function writeLocalSkillMetadata(
    skillDirectoryPath: string,
): Promise<void> {
    const metadataFilePath = resolveManagedSkillMetadataFilePath(skillDirectoryPath);
    const desiredContent = renderSkillMetadataJson(createLocalSkillMetadata());

    try {
        if (await readFile(metadataFilePath, "utf8") === desiredContent) {
            return;
        }
    }
    catch (error) {
        if (!isNodeNotFoundError(error)) {
            throw error;
        }
    }

    await Bun.write(metadataFilePath, desiredContent);
}
