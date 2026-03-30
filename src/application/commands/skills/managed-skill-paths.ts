import { dirname, join } from "node:path";

const codexSkillsDirectoryName = "skills";

export const managedSkillMetadataFileName = ".oo-metadata.json";

export function resolveManagedSkillDirectoryPath(
    codexHomeDirectory: string,
    skillName: string,
): string {
    return join(codexHomeDirectory, codexSkillsDirectoryName, skillName);
}

export function resolveManagedSkillCanonicalDirectoryPath(
    settingsFilePath: string,
    skillName: string,
): string {
    return join(dirname(settingsFilePath), codexSkillsDirectoryName, skillName);
}

export function resolveManagedSkillMetadataFilePath(
    skillDirectoryPath: string,
): string {
    return join(skillDirectoryPath, managedSkillMetadataFileName);
}
