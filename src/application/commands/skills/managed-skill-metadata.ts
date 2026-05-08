import type { RegistrySkillMetadata } from "./skill-metadata.ts";

import { readFile } from "node:fs/promises";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import { resolveManagedSkillMetadataFilePath } from "./managed-skill-paths.ts";
import {
    createRegistrySkillMetadata,
    parseSkillMetadataContent,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

export type { RegistrySkillMetadata as ManagedSkillMetadata } from "./skill-metadata.ts";

export function parseManagedSkillMetadataContent(
    content: string,
): RegistrySkillMetadata | undefined {
    const parsedMetadata = parseSkillMetadataContent(content);

    if (parsedMetadata?.kind !== "registry") {
        return undefined;
    }

    return parsedMetadata;
}

export async function readManagedSkillMetadata(
    skillDirectoryPath: string,
): Promise<RegistrySkillMetadata | undefined> {
    try {
        return parseManagedSkillMetadataContent(
            await readFile(
                resolveManagedSkillMetadataFilePath(skillDirectoryPath),
                "utf8",
            ),
        );
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }
}

export async function writeManagedSkillMetadata(
    skillDirectoryPath: string,
    metadata: Pick<RegistrySkillMetadata, "icon" | "packageName" | "version">,
): Promise<void> {
    await Bun.write(
        resolveManagedSkillMetadataFilePath(skillDirectoryPath),
        renderSkillMetadataJson(createRegistrySkillMetadata(metadata)),
    );
}
