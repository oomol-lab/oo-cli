import { readFile } from "node:fs/promises";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import { resolveManagedSkillMetadataFilePath } from "./managed-skill-paths.ts";
import {
    parseSkillMetadataWithVersion,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

export interface ManagedSkillMetadata {
    icon?: string;
    packageName?: string;
    version: string;
}

export function parseManagedSkillMetadataContent(
    content: string,
): ManagedSkillMetadata | undefined {
    const parsedMetadata = parseSkillMetadataWithVersion(content);

    if (parsedMetadata === undefined) {
        return undefined;
    }
    const rawPackageName = parsedMetadata.fields.packageName;
    const rawIcon = parsedMetadata.fields.icon;
    let icon: string | undefined;
    let packageName: string | undefined;

    if (rawIcon !== undefined) {
        if (typeof rawIcon !== "string" || rawIcon.trim() === "") {
            return undefined;
        }

        icon = rawIcon;
    }

    if (rawPackageName !== undefined) {
        if (typeof rawPackageName !== "string" || rawPackageName.trim() === "") {
            return undefined;
        }

        packageName = rawPackageName;
    }

    if (icon !== undefined) {
        return {
            icon,
            packageName,
            version: parsedMetadata.version,
        };
    }

    return {
        packageName,
        version: parsedMetadata.version,
    };
}

export async function readManagedSkillMetadata(
    skillDirectoryPath: string,
): Promise<ManagedSkillMetadata | undefined> {
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
    metadata: ManagedSkillMetadata,
): Promise<void> {
    await Bun.write(
        resolveManagedSkillMetadataFilePath(skillDirectoryPath),
        renderSkillMetadataJson(metadata),
    );
}
