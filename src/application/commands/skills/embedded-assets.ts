import { render } from "agentic-markdown";

import ooCreateSkillOpenAIAgentPath from "../../../../contrib/skills/shared/oo-create-skill/agents/openai.yaml" with { type: "file" };
import ooCreateSkillPath from "../../../../contrib/skills/shared/oo-create-skill/SKILL.md" with { type: "file" };
import ooFindSkillsOpenAIAgentPath from "../../../../contrib/skills/shared/oo-find-skills/agents/openai.yaml" with { type: "file" };
import ooFindSkillsCliContractPath from "../../../../contrib/skills/shared/oo-find-skills/references/oo-cli-contract.md" with { type: "file" };
import ooFindSkillsSkillPath from "../../../../contrib/skills/shared/oo-find-skills/SKILL.md" with { type: "file" };
import ooPublishSkillOpenAIAgentPath from "../../../../contrib/skills/shared/oo-publish-skill/agents/openai.yaml" with { type: "file" };
import ooPublishSkillPath from "../../../../contrib/skills/shared/oo-publish-skill/SKILL.md" with { type: "file" };
import ooOpenAIAgentPath from "../../../../contrib/skills/shared/oo/agents/openai.yaml" with { type: "file" };
import ooAuthAndBillingReferencePath from "../../../../contrib/skills/shared/oo/references/auth-and-billing.md" with { type: "file" };
import ooConnectorExecutionReferencePath from "../../../../contrib/skills/shared/oo/references/connector-execution.md" with { type: "file" };
import ooFileTransferReferencePath from "../../../../contrib/skills/shared/oo/references/file-transfer.md" with { type: "file" };
import ooLlmClientReferencePath from "../../../../contrib/skills/shared/oo/references/llm-client.md" with { type: "file" };
import ooPackageExecutionReferencePath from "../../../../contrib/skills/shared/oo/references/package-execution.md" with { type: "file" };
import ooSearchAndSelectionReferencePath from "../../../../contrib/skills/shared/oo/references/search-and-selection.md" with { type: "file" };
import ooTaskLifecycleReferencePath from "../../../../contrib/skills/shared/oo/references/task-lifecycle.md" with { type: "file" };
import ooSkillPath from "../../../../contrib/skills/shared/oo/SKILL.md" with { type: "file" };

export const availableBundledSkillAgentNames = ["codex", "claude", "hermes", "codebuddy", "workbuddy", "trae", "trae-cn", "openclaw", "qoderwork", "deepseek-tui"] as const;
export type BundledSkillAgentName = (typeof availableBundledSkillAgentNames)[number];

export const availableBundledSkillNames = ["oo", "oo-find-skills", "oo-create-skill", "oo-publish-skill"] as const;
export type BundledSkillName = (typeof availableBundledSkillNames)[number];

type BundledSkillFileContentKind = "agenticMarkdown" | "static";
type SkillSelectionPromptTool = "AskUserQuestion" | "request_user_input";

interface BundledSkillSourceFile {
    readonly contentKind: BundledSkillFileContentKind;
    readonly relativePath: string;
    readonly sourcePath: string;
}

interface BundledSkillDefinition {
    readonly files: readonly BundledSkillSourceFile[];
}

export interface BundledSkillFile extends BundledSkillSourceFile {
    readonly agentName: BundledSkillAgentName;
    readonly skillName: BundledSkillName;
}

interface BundledSkillAgentConfig {
    readonly skillSelectionPromptTool: SkillSelectionPromptTool;
    readonly title: string;
}

const bundledSkillAgentConfigs = {
    "claude": { skillSelectionPromptTool: "AskUserQuestion", title: "Claude" },
    "codebuddy": { skillSelectionPromptTool: "AskUserQuestion", title: "CodeBuddy" },
    "codex": { skillSelectionPromptTool: "request_user_input", title: "Codex" },
    "deepseek-tui": { skillSelectionPromptTool: "AskUserQuestion", title: "DeepSeek TUI" },
    "hermes": { skillSelectionPromptTool: "AskUserQuestion", title: "Hermes" },
    "openclaw": { skillSelectionPromptTool: "request_user_input", title: "OpenClaw" },
    "qoderwork": { skillSelectionPromptTool: "AskUserQuestion", title: "QoderWork" },
    "trae": { skillSelectionPromptTool: "AskUserQuestion", title: "Trae" },
    "trae-cn": { skillSelectionPromptTool: "AskUserQuestion", title: "Trae CN" },
    "workbuddy": { skillSelectionPromptTool: "AskUserQuestion", title: "WorkBuddy" },
} as const satisfies Record<BundledSkillAgentName, BundledSkillAgentConfig>;

const bundledSkillRegistry = {
    "oo": createAgentDefinitions([
        createAgenticMarkdownFile("SKILL.md", ooSkillPath),
        createStaticFile("agents/openai.yaml", ooOpenAIAgentPath),
        ...createOoReferenceFiles({
            authAndBilling: ooAuthAndBillingReferencePath,
            connectorExecution: ooConnectorExecutionReferencePath,
            fileTransfer: ooFileTransferReferencePath,
            llmClient: ooLlmClientReferencePath,
            packageExecution: ooPackageExecutionReferencePath,
            searchAndSelection: ooSearchAndSelectionReferencePath,
            taskLifecycle: ooTaskLifecycleReferencePath,
        }),
    ]),
    "oo-create-skill": createAgentDefinitions([
        createAgenticMarkdownFile("SKILL.md", ooCreateSkillPath),
        createStaticFile("agents/openai.yaml", ooCreateSkillOpenAIAgentPath),
    ]),
    "oo-find-skills": createAgentDefinitions([
        createAgenticMarkdownFile("SKILL.md", ooFindSkillsSkillPath),
        createStaticFile("agents/openai.yaml", ooFindSkillsOpenAIAgentPath),
        createAgenticMarkdownFile("references/oo-cli-contract.md", ooFindSkillsCliContractPath),
    ]),
    "oo-publish-skill": createAgentDefinitions([
        createAgenticMarkdownFile("SKILL.md", ooPublishSkillPath),
        createStaticFile("agents/openai.yaml", ooPublishSkillOpenAIAgentPath),
    ]),
} as const satisfies Record<
    BundledSkillName,
    Record<BundledSkillAgentName, BundledSkillDefinition>
>;

export function getBundledSkillFiles(
    skillName: BundledSkillName,
    agentName: BundledSkillAgentName = "codex",
): readonly BundledSkillFile[] {
    const skillDefinition = bundledSkillRegistry[skillName][agentName];

    return skillDefinition.files.map(file => ({
        ...file,
        agentName,
        skillName,
    }));
}

export async function readBundledSkillFileContent(
    file: BundledSkillFile,
): Promise<string> {
    const content = await Bun.file(file.sourcePath).text();

    if (file.contentKind === "static") {
        return content;
    }

    const agentConfig = bundledSkillAgentConfigs[file.agentName];

    return render(content, {
        agent: file.agentName,
        agentTitle: agentConfig.title,
        skillSelectionPromptTool: agentConfig.skillSelectionPromptTool,
    });
}

function createAgentDefinitions(
    files: readonly BundledSkillSourceFile[],
): Record<BundledSkillAgentName, BundledSkillDefinition> {
    return Object.fromEntries(
        availableBundledSkillAgentNames.map(agentName => [
            agentName,
            {
                files: agentName === "codex"
                    ? files
                    : files.filter(file => file.relativePath !== "agents/openai.yaml"),
            } satisfies BundledSkillDefinition,
        ]),
    ) as Record<BundledSkillAgentName, BundledSkillDefinition>;
}

function createOoReferenceFiles(sourcePaths: {
    authAndBilling: string;
    connectorExecution: string;
    fileTransfer: string;
    llmClient: string;
    packageExecution: string;
    searchAndSelection: string;
    taskLifecycle: string;
}): readonly BundledSkillSourceFile[] {
    return [
        createAgenticMarkdownFile("references/auth-and-billing.md", sourcePaths.authAndBilling),
        createAgenticMarkdownFile("references/llm-client.md", sourcePaths.llmClient),
        createAgenticMarkdownFile("references/search-and-selection.md", sourcePaths.searchAndSelection),
        createAgenticMarkdownFile("references/package-execution.md", sourcePaths.packageExecution),
        createAgenticMarkdownFile("references/connector-execution.md", sourcePaths.connectorExecution),
        createAgenticMarkdownFile("references/file-transfer.md", sourcePaths.fileTransfer),
        createAgenticMarkdownFile("references/task-lifecycle.md", sourcePaths.taskLifecycle),
    ];
}

function createAgenticMarkdownFile(
    relativePath: string,
    sourcePath: string,
): BundledSkillSourceFile {
    return {
        contentKind: "agenticMarkdown",
        relativePath,
        sourcePath,
    };
}

function createStaticFile(
    relativePath: string,
    sourcePath: string,
): BundledSkillSourceFile {
    return {
        contentKind: "static",
        relativePath,
        sourcePath,
    };
}
