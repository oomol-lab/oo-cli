import type { BundledSkillAgentName, BundledSkillName } from "./embedded-assets.ts";

import { dirname, join } from "node:path";
import { resolveHomeDirectory } from "../../path/home-directory.ts";

const codexDirectoryName = ".codex";
const claudeDirectoryName = ".claude";
export const codexSkillsDirectoryName = "skills";
const claudeBundledSkillsDirectoryName = "claude-skills";

export const bundledSkillMetadataFileName = ".oo-metadata.json";
const codexBundledSkillOwnershipFileRelativePath = "agents/openai.yaml";

export function resolveCodexHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    const explicitCodexHome = env.CODEX_HOME?.trim();

    if (explicitCodexHome) {
        return explicitCodexHome;
    }

    return join(resolveHomeDirectory(env), codexDirectoryName);
}

export function resolveClaudeHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return join(resolveHomeDirectory(env), claudeDirectoryName);
}

export function resolveBundledSkillHomeDirectory(
    env: Record<string, string | undefined>,
    agentName: BundledSkillAgentName,
): string {
    switch (agentName) {
        case "claude":
            return resolveClaudeHomeDirectory(env);
        case "codex":
            return resolveCodexHomeDirectory(env);
    }
}

export function resolveBundledSkillDirectoryPath(
    homeDirectory: string,
    skillName: BundledSkillName,
): string {
    return join(homeDirectory, codexSkillsDirectoryName, skillName);
}

export function resolveBundledSkillCanonicalRootDirectoryPath(
    settingsFilePath: string,
    agentName: BundledSkillAgentName = "codex",
): string {
    switch (agentName) {
        case "claude":
            return join(dirname(settingsFilePath), claudeBundledSkillsDirectoryName);
        case "codex":
            return join(dirname(settingsFilePath), codexSkillsDirectoryName);
    }
}

export function resolveBundledSkillCanonicalDirectoryPath(
    settingsFilePath: string,
    skillName: BundledSkillName,
    agentName: BundledSkillAgentName = "codex",
): string {
    return join(
        resolveBundledSkillCanonicalRootDirectoryPath(settingsFilePath, agentName),
        skillName,
    );
}

export function resolveBundledSkillOwnershipFileRelativePath(
    agentName: BundledSkillAgentName,
): string | undefined {
    switch (agentName) {
        case "claude":
            return undefined;
        case "codex":
            return codexBundledSkillOwnershipFileRelativePath;
    }
}

export function resolveBundledSkillMetadataFilePath(
    skillDirectoryPath: string,
): string {
    return join(skillDirectoryPath, bundledSkillMetadataFileName);
}
