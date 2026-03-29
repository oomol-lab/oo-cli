import type { BundledSkillName } from "./embedded-assets.ts";

import { dirname, join } from "node:path";
import { resolveHomeDirectory } from "../../path/home-directory.ts";

const codexDirectoryName = ".codex";
const codexSkillsDirectoryName = "skills";

export const bundledSkillMetadataFileName = ".oo-metadata.json";
export const bundledSkillOwnershipFileRelativePath = "agents/openai.yaml";

export function resolveCodexHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    const explicitCodexHome = env.CODEX_HOME?.trim();

    if (explicitCodexHome) {
        return explicitCodexHome;
    }

    return join(resolveHomeDirectory(env), codexDirectoryName);
}

export function resolveBundledSkillDirectoryPath(
    codexHomeDirectory: string,
    skillName: BundledSkillName,
): string {
    return join(codexHomeDirectory, codexSkillsDirectoryName, skillName);
}

export function resolveBundledSkillCanonicalDirectoryPath(
    settingsFilePath: string,
    skillName: BundledSkillName,
): string {
    return join(dirname(settingsFilePath), codexSkillsDirectoryName, skillName);
}

export function resolveBundledSkillMetadataFilePath(
    skillDirectoryPath: string,
): string {
    return join(skillDirectoryPath, bundledSkillMetadataFileName);
}
