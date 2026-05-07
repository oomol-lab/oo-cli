import type { BundledSkillPublicationMode } from "./bundled-skill-filesystem.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";

import { lstat } from "node:fs/promises";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";

const symlinkCapableManagedSkillAgentNames: ReadonlySet<BundledSkillAgentName> = new Set([
    "claude",
    "codex",
    "qoderwork",
]);

export function resolveManagedSkillPublicationMode(
    agentName: BundledSkillAgentName,
): BundledSkillPublicationMode {
    return symlinkCapableManagedSkillAgentNames.has(agentName)
        ? "symlink-or-copy"
        : "copy";
}

export async function isManagedSkillPublicationCurrent(
    skillDirectoryPath: string,
    publicationMode: BundledSkillPublicationMode,
): Promise<boolean> {
    switch (publicationMode) {
        case "copy":
            try {
                return !(await lstat(skillDirectoryPath)).isSymbolicLink();
            }
            catch (error) {
                if (isNodeNotFoundError(error)) {
                    return false;
                }

                throw error;
            }
        case "symlink-or-copy":
            return true;
    }
}
