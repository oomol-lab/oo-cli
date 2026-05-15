import type { CliExecutionContext } from "../../contracts/cli.ts";

import { join } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import { resolveHomeDirectory } from "../../path/home-directory.ts";

type SkillSelectionPromptTool = "AskUserQuestion" | "request_user_input";

export interface SupportedSkillAgent {
    readonly homeDirectoryName: string;
    readonly homeEnvVar?: string;
    readonly name: BundledSkillAgentName;
    readonly skillSelectionPromptTool?: SkillSelectionPromptTool;
    readonly title: string;
}

export const supportedSkillAgents = [
    {
        homeDirectoryName: ".codex",
        homeEnvVar: "CODEX_HOME",
        name: "codex",
        skillSelectionPromptTool: "request_user_input",
        title: "Codex",
    },
    {
        homeDirectoryName: ".claude",
        name: "claude",
        skillSelectionPromptTool: "AskUserQuestion",
        title: "Claude",
    },
    {
        homeDirectoryName: ".hermes",
        homeEnvVar: "HERMES_HOME",
        name: "hermes",
        skillSelectionPromptTool: "AskUserQuestion",
        title: "Hermes",
    },
    {
        homeDirectoryName: ".codebuddy",
        name: "codebuddy",
        skillSelectionPromptTool: "AskUserQuestion",
        title: "CodeBuddy",
    },
    {
        homeDirectoryName: ".workbuddy",
        name: "workbuddy",
        skillSelectionPromptTool: "AskUserQuestion",
        title: "WorkBuddy",
    },
    {
        homeDirectoryName: ".trae",
        name: "trae",
        skillSelectionPromptTool: "AskUserQuestion",
        title: "Trae",
    },
    {
        homeDirectoryName: ".trae-cn",
        name: "trae-cn",
        skillSelectionPromptTool: "AskUserQuestion",
        title: "Trae CN",
    },
    {
        homeDirectoryName: ".openclaw",
        homeEnvVar: "OPENCLAW_HOME",
        name: "openclaw",
        title: "OpenClaw",
    },
    {
        homeDirectoryName: ".qoderwork",
        name: "qoderwork",
        skillSelectionPromptTool: "AskUserQuestion",
        title: "QoderWork",
    },
    {
        homeDirectoryName: ".deepseek",
        name: "deepseek-tui",
        skillSelectionPromptTool: "AskUserQuestion",
        title: "DeepSeek TUI",
    },
] as const;

export type BundledSkillAgentName = (typeof supportedSkillAgents)[number]["name"];

export const availableBundledSkillAgentNames = supportedSkillAgents.map(
    agent => agent.name,
) as readonly BundledSkillAgentName[];

export type ManagedSkillAgentTranslator = Pick<CliExecutionContext["translator"], "t">;

const supportedSkillAgentByName = Object.fromEntries(
    supportedSkillAgents.map(agent => [agent.name, agent]),
) as Record<BundledSkillAgentName, SupportedSkillAgent>;

const supportedSkillAgentOrder = Object.fromEntries(
    supportedSkillAgents.map((agent, index) => [agent.name, index]),
) as Record<BundledSkillAgentName, number>;

export function readManagedSkillAgent(
    agentName: BundledSkillAgentName,
): SupportedSkillAgent {
    return supportedSkillAgentByName[agentName];
}

export function resolveManagedSkillAgentHomeDirectory(
    env: Record<string, string | undefined>,
    agentName: BundledSkillAgentName,
): string {
    const agent = readManagedSkillAgent(agentName);
    const explicitHomeDirectory = agent.homeEnvVar === undefined
        ? undefined
        : env[agent.homeEnvVar]?.trim();

    if (explicitHomeDirectory !== undefined && explicitHomeDirectory !== "") {
        return explicitHomeDirectory;
    }

    return join(resolveHomeDirectory(env), agent.homeDirectoryName);
}

export function readManagedSkillAgentLabel(
    agentName: BundledSkillAgentName,
    translator: ManagedSkillAgentTranslator,
): string {
    return translator.t(`skills.list.host.${agentName}`);
}

export function readManagedSkillAgentLabels(
    agentNames: readonly BundledSkillAgentName[],
    translator: ManagedSkillAgentTranslator,
): string {
    return agentNames.map(agentName =>
        readManagedSkillAgentLabel(agentName, translator),
    ).join(", ");
}

export function compareManagedSkillAgentNames(
    left: BundledSkillAgentName,
    right: BundledSkillAgentName,
): number {
    return supportedSkillAgentOrder[left] - supportedSkillAgentOrder[right];
}

export function formatSupportedSkillAgentNames(): string {
    return availableBundledSkillAgentNames.join(", ");
}

export function parseManagedSkillAgentOption(
    value: string | undefined,
    errorKey: string,
): BundledSkillAgentName | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (availableBundledSkillAgentNames.includes(value as BundledSkillAgentName)) {
        return value as BundledSkillAgentName;
    }

    throw new CliUserError(errorKey, 2, {
        agents: formatSupportedSkillAgentNames(),
        value,
    });
}

export function createMissingRequiredSkillAgentError(errorKey: string): CliUserError {
    return new CliUserError(errorKey, 1, {
        agents: formatSupportedSkillAgentNames(),
    });
}

export function createManagedSkillAgentNotInstalledError(
    agentName: BundledSkillAgentName,
    path: string,
    translator?: ManagedSkillAgentTranslator,
): CliUserError {
    const displayName = translator === undefined
        ? readManagedSkillAgent(agentName).title
        : readManagedSkillAgentLabel(agentName, translator);

    return new CliUserError("errors.skills.agentNotInstalled", 1, {
        agentName: displayName,
        path,
    });
}
