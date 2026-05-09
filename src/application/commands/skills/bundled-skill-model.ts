import type { BundledSkillMetadata } from "./skill-metadata.ts";

import { parseSkillMetadataContent } from "./skill-metadata.ts";

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
    const parsedMetadata = parseSkillMetadataContent(content);

    if (parsedMetadata?.kind !== "bundled") {
        return undefined;
    }

    return parsedMetadata;
}
