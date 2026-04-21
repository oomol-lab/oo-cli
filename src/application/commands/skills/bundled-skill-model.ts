import { parseSkillMetadataWithVersion } from "./skill-metadata.ts";

export interface BundledSkillMetadata {
    version: string;
}

export const bundledSkillDevelopmentVersion = "0.0.0-development";

export type BundledSkillInstallConflict = "nameConflict" | "storageConflict";

export function resolveBundledSkillInstallConflict(input: {
    canonicalDirectoryExists: boolean;
    canonicalDirectoryManaged: boolean;
    installedDirectoryExists: boolean;
    installedDirectoryManaged: boolean;
}): BundledSkillInstallConflict | undefined {
    if (input.installedDirectoryExists && !input.installedDirectoryManaged) {
        return "nameConflict";
    }

    if (input.canonicalDirectoryExists && !input.canonicalDirectoryManaged) {
        return "storageConflict";
    }

    return undefined;
}

export function canUninstallManagedBundledSkillInstallation(input: {
    installedDirectoryExists: boolean;
    installedDirectoryManaged: boolean;
}): boolean {
    return input.installedDirectoryExists && input.installedDirectoryManaged;
}

export function parseBundledSkillMetadataContent(
    content: string,
): BundledSkillMetadata | undefined {
    const parsedMetadata = parseSkillMetadataWithVersion(content);

    if (parsedMetadata === undefined) {
        return undefined;
    }

    return {
        version: parsedMetadata.version,
    };
}
