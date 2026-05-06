import type { BundledSkillAgentName, BundledSkillName } from "./embedded-assets.ts";

import { dirname, join } from "node:path";
import { resolveHomeDirectory } from "../../path/home-directory.ts";

const codexDirectoryName = ".codex";
const claudeDirectoryName = ".claude";
const codeBuddyDirectoryName = ".codebuddy";
const hermesDirectoryName = ".hermes";
const openClawDirectoryName = ".openclaw";
const qoderWorkDirectoryName = ".qoderwork";
const traeCnDirectoryName = ".trae-cn";
const traeDirectoryName = ".trae";
const workBuddyDirectoryName = ".workbuddy";
export const codexSkillsDirectoryName = "skills";
export const canonicalBundledSkillsDirectoryName = "bundled";
export const canonicalLocalSkillsDirectoryName = "local";
export const canonicalRegistrySkillsDirectoryName = "registry";

export const bundledSkillMetadataFileName = ".oo-metadata.json";

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

export function resolveCodeBuddyHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return join(resolveHomeDirectory(env), codeBuddyDirectoryName);
}

export function resolveHermesHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    const explicitHermesHome = env.HERMES_HOME?.trim();

    if (explicitHermesHome) {
        return explicitHermesHome;
    }

    return join(resolveHomeDirectory(env), hermesDirectoryName);
}

export function resolveOpenClawHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    const explicitOpenClawHome = env.OPENCLAW_HOME?.trim();

    if (explicitOpenClawHome) {
        return explicitOpenClawHome;
    }

    return join(resolveHomeDirectory(env), openClawDirectoryName);
}

export function resolveQoderWorkHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return join(resolveHomeDirectory(env), qoderWorkDirectoryName);
}

export function resolveTraeHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return join(resolveHomeDirectory(env), traeDirectoryName);
}

export function resolveTraeCnHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return join(resolveHomeDirectory(env), traeCnDirectoryName);
}

export function resolveWorkBuddyHomeDirectory(
    env: Record<string, string | undefined>,
): string {
    return join(resolveHomeDirectory(env), workBuddyDirectoryName);
}

export function resolveBundledSkillHomeDirectory(
    env: Record<string, string | undefined>,
    agentName: BundledSkillAgentName,
): string {
    switch (agentName) {
        case "claude":
            return resolveClaudeHomeDirectory(env);
        case "codebuddy":
            return resolveCodeBuddyHomeDirectory(env);
        case "codex":
            return resolveCodexHomeDirectory(env);
        case "hermes":
            return resolveHermesHomeDirectory(env);
        case "openclaw":
            return resolveOpenClawHomeDirectory(env);
        case "qoderwork":
            return resolveQoderWorkHomeDirectory(env);
        case "trae":
            return resolveTraeHomeDirectory(env);
        case "trae-cn":
            return resolveTraeCnHomeDirectory(env);
        case "workbuddy":
            return resolveWorkBuddyHomeDirectory(env);
    }
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
