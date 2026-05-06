import type { BundledSkillPublicationMode } from "./bundled-skill-filesystem.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";

const symlinkCapableManagedSkillAgentNames: ReadonlySet<BundledSkillAgentName> = new Set([
    "claude",
    "codex",
    "qoderwork",
    "trae",
    "trae-cn",
]);

export function resolveManagedSkillPublicationMode(
    agentName: BundledSkillAgentName,
): BundledSkillPublicationMode {
    return symlinkCapableManagedSkillAgentNames.has(agentName)
        ? "symlink-or-copy"
        : "copy";
}
