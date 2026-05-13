import type { BundledSkillAgentName } from "./embedded-assets.ts";

export type ManagedSkillHostMissingErrorKey
    = | "errors.skills.claudeNotInstalled"
        | "errors.skills.codebuddyNotInstalled"
        | "errors.skills.codexNotInstalled"
        | "errors.skills.deepseekTuiNotInstalled"
        | "errors.skills.hermesNotInstalled"
        | "errors.skills.openclawNotInstalled"
        | "errors.skills.qoderworkNotInstalled"
        | "errors.skills.traeCnNotInstalled"
        | "errors.skills.traeNotInstalled"
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
        case "deepseek-tui":
            return "errors.skills.deepseekTuiNotInstalled";
        case "hermes":
            return "errors.skills.hermesNotInstalled";
        case "openclaw":
            return "errors.skills.openclawNotInstalled";
        case "qoderwork":
            return "errors.skills.qoderworkNotInstalled";
        case "trae":
            return "errors.skills.traeNotInstalled";
        case "trae-cn":
            return "errors.skills.traeCnNotInstalled";
        case "workbuddy":
            return "errors.skills.workbuddyNotInstalled";
    }
}
