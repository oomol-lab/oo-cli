import type {
    LocalSkillMetadata,
    SkillMetadata,
} from "./skill-metadata.ts";

import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { CliUserError } from "../../contracts/cli.ts";
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
        const currentContent = await readFile(metadataFilePath, "utf8");
        const currentMetadata = parseSkillMetadataContent(currentContent);

        if (currentMetadata?.kind !== "local") {
            throw new CliUserError("errors.skills.nameConflict", 1, {
                name: basename(skillDirectoryPath),
                path: skillDirectoryPath,
            });
        }

        if (currentContent === desiredContent) {
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
