import { parseSkillMetadataWithVersion } from "./skill-metadata.ts";

export interface BundledSkillMetadata {
    version: string;
}

export const bundledSkillDevelopmentVersion = "0.0.0-development";

export type BundledSkillInstallConflict = "nameConflict" | "storageConflict";

export type BundledSkillManagedSynchronizationAction
    = "skip-current" | "sync-installation";

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

export function resolveBundledSkillManagedSynchronizationAction(input: {
    isCurrentInstallation: boolean;
}): BundledSkillManagedSynchronizationAction {
    return input.isCurrentInstallation ? "skip-current" : "sync-installation";
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

export function isBundledSkillInstallationCurrentState(input: {
    hasAllBundledFiles: boolean;
    hasMetadataFile: boolean;
    installedVersion: string | undefined;
    isManagedInstallation: boolean;
    version: string;
}): boolean {
    return input.isManagedInstallation
        && input.hasMetadataFile
        && input.installedVersion === input.version
        && input.hasAllBundledFiles;
}
