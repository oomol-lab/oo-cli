import type { BundledSkillName } from "./embedded-assets.ts";
import type { BundledSkillAgentName } from "./managed-skill-agents.ts";

import { dirname, join } from "node:path";

export const managedSkillsDirectoryName = "skills";
export const canonicalBundledSkillsDirectoryName = "bundled";
export const canonicalLocalSkillsDirectoryName = "local";
export const canonicalRegistrySkillsDirectoryName = "registry";

export const bundledSkillMetadataFileName = ".oo-metadata.json";

export function resolveBundledSkillDirectoryPath(
    homeDirectory: string,
    skillName: string,
): string {
    return join(homeDirectory, managedSkillsDirectoryName, skillName);
}

export function resolveBundledSkillCanonicalRootDirectoryPath(
    settingsFilePath: string,
    agentName: BundledSkillAgentName = "universal",
): string {
    return join(
        dirname(settingsFilePath),
        managedSkillsDirectoryName,
        canonicalBundledSkillsDirectoryName,
        agentName,
    );
}

export function resolveBundledSkillCanonicalDirectoryPath(
    settingsFilePath: string,
    skillName: BundledSkillName,
    agentName: BundledSkillAgentName = "universal",
): string {
    return join(
        resolveBundledSkillCanonicalRootDirectoryPath(settingsFilePath, agentName),
        skillName,
    );
}

export function resolveBundledSkillMetadataFilePath(
    skillDirectoryPath: string,
): string {
    return join(skillDirectoryPath, bundledSkillMetadataFileName);
}
