import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";

export type ManagedSkillHostTranslator = Pick<CliExecutionContext["translator"], "t">;

export function readManagedSkillHostLabel(
    agentName: BundledSkillAgentName,
    translator: ManagedSkillHostTranslator,
): string {
    switch (agentName) {
        case "claude":
            return translator.t("skills.list.host.claude");
        case "codebuddy":
            return translator.t("skills.list.host.codebuddy");
        case "codex":
            return translator.t("skills.list.host.codex");
        case "hermes":
            return translator.t("skills.list.host.hermes");
        case "openclaw":
            return translator.t("skills.list.host.openclaw");
        case "qoderwork":
            return translator.t("skills.list.host.qoderwork");
        case "trae":
            return translator.t("skills.list.host.trae");
        case "workbuddy":
            return translator.t("skills.list.host.workbuddy");
        default:
            return agentName satisfies never;
    }
}

export function readManagedSkillHostLabels(
    agentNames: readonly BundledSkillAgentName[],
    translator: ManagedSkillHostTranslator,
): string {
    return agentNames.map(agentName =>
        readManagedSkillHostLabel(agentName, translator),
    ).join(", ");
}
