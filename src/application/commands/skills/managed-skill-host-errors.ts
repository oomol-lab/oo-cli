import type { BundledSkillAgentName } from "./embedded-assets.ts";

export type ManagedSkillHostMissingErrorKey
    = | "errors.skills.claudeNotInstalled"
        | "errors.skills.codebuddyNotInstalled"
        | "errors.skills.codexNotInstalled"
        | "errors.skills.openclawNotInstalled"
        | "errors.skills.qoderworkNotInstalled"
        | "errors.skills.workbuddyNotInstalled";

export function resolveManagedSkillHostMissingErrorKey(
    agentName: BundledSkillAgentName,
): ManagedSkillHostMissingErrorKey {
    switch (agentName) {
        case "claude":
            return "errors.skills.claudeNotInstalled";
        case "codebuddy":
            return "errors.skills.codebuddyNotInstalled";
        case "codex":
            return "errors.skills.codexNotInstalled";
        case "openclaw":
            return "errors.skills.openclawNotInstalled";
        case "qoderwork":
            return "errors.skills.qoderworkNotInstalled";
        case "workbuddy":
            return "errors.skills.workbuddyNotInstalled";
    }
}
