import type { BundledSkillName } from "./embedded-assets.ts";
import type { BundledSkillAgentName } from "./managed-skill-agents.ts";

import { dirname, join } from "node:path";
import {
    resolveManagedSkillAgentHomeDirectory,
} from "./managed-skill-agents.ts";

export const codexSkillsDirectoryName = "skills";
export const canonicalBundledSkillsDirectoryName = "bundled";
export const canonicalLocalSkillsDirectoryName = "local";
export const canonicalRegistrySkillsDirectoryName = "registry";

export const bundledSkillMetadataFileName = ".oo-metadata.json";

export function resolveCodexHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return resolveBundledSkillHomeDirectory(env, "codex");
}

export function resolveClaudeHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return resolveBundledSkillHomeDirectory(env, "claude");
}

export function resolveCodeBuddyHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return resolveBundledSkillHomeDirectory(env, "codebuddy");
}

export function resolveDeepSeekTuiHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return resolveBundledSkillHomeDirectory(env, "deepseek-tui");
}

export function resolveHermesHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return resolveBundledSkillHomeDirectory(env, "hermes");
}

export function resolveOpenClawHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return resolveBundledSkillHomeDirectory(env, "openclaw");
}

export function resolveQoderWorkHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return resolveBundledSkillHomeDirectory(env, "qoderwork");
}

export function resolveTraeHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return resolveBundledSkillHomeDirectory(env, "trae");
}

export function resolveTraeCnHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return resolveBundledSkillHomeDirectory(env, "trae-cn");
}

export function resolveWorkBuddyHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return resolveBundledSkillHomeDirectory(env, "workbuddy");
}

export function resolveBundledSkillHomeDirectory(
    env: Record<string, string | undefined>,
    agentName: BundledSkillAgentName,
): string {
    return resolveManagedSkillAgentHomeDirectory(env, agentName);
}

export function resolveBundledSkillDirectoryPath(
    homeDirectory: string,
    skillName: string,
): string {
    return join(homeDirectory, codexSkillsDirectoryName, skillName);
}

export function resolveBundledSkillCanonicalRootDirectoryPath(
    settingsFilePath: string,
    agentName: BundledSkillAgentName = "codex",
): string {
    return join(
        dirname(settingsFilePath),
        codexSkillsDirectoryName,
        canonicalBundledSkillsDirectoryName,
        agentName,
    );
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

export function resolveBundledSkillMetadataFilePath(
    skillDirectoryPath: string,
): string {
    return join(skillDirectoryPath, bundledSkillMetadataFileName);
}
