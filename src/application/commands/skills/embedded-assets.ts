import type { BundledSkillAgentName } from "./managed-skill-agents.ts";
import { render } from "agentic-markdown";

import ooCreateSkillPath from "../../../../contrib/skills/shared/oo-create-skill/SKILL.md" with { type: "file" };
import ooFindSkillsCliContractPath from "../../../../contrib/skills/shared/oo-find-skills/references/oo-cli-contract.md" with { type: "file" };
import ooFindSkillsSkillPath from "../../../../contrib/skills/shared/oo-find-skills/SKILL.md" with { type: "file" };
import ooPublishSkillPath from "../../../../contrib/skills/shared/oo-publish-skill/SKILL.md" with { type: "file" };
import ooAuthAndBillingReferencePath from "../../../../contrib/skills/shared/oo/references/auth-and-billing.md" with { type: "file" };
import ooConnectorExecutionReferencePath from "../../../../contrib/skills/shared/oo/references/connector-execution.md" with { type: "file" };
import ooFileTransferReferencePath from "../../../../contrib/skills/shared/oo/references/file-transfer.md" with { type: "file" };
import ooLlmClientReferencePath from "../../../../contrib/skills/shared/oo/references/llm-client.md" with { type: "file" };
import ooSearchAndSelectionReferencePath from "../../../../contrib/skills/shared/oo/references/search-and-selection.md" with { type: "file" };
import ooSkillPath from "../../../../contrib/skills/shared/oo/SKILL.md" with { type: "file" };

import {
    availableBundledSkillAgentNames,
    readManagedSkillAgent,
} from "./managed-skill-agents.ts";

export { availableBundledSkillAgentNames } from "./managed-skill-agents.ts";
export type { BundledSkillAgentName } from "./managed-skill-agents.ts";

export const availableBundledSkillNames = ["oo", "oo-find-skills", "oo-create-skill", "oo-publish-skill"] as const;
export type BundledSkillName = (typeof availableBundledSkillNames)[number];

interface BundledSkillSourceFile {
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

const bundledSkillRegistry = {
    "oo": createAgentDefinitions([
        createAgenticMarkdownFile("SKILL.md", ooSkillPath),
        ...createOoReferenceFiles({
            authAndBilling: ooAuthAndBillingReferencePath,
            connectorExecution: ooConnectorExecutionReferencePath,
            fileTransfer: ooFileTransferReferencePath,
            llmClient: ooLlmClientReferencePath,
            searchAndSelection: ooSearchAndSelectionReferencePath,
        }),
    ]),
    "oo-create-skill": createAgentDefinitions([
        createAgenticMarkdownFile("SKILL.md", ooCreateSkillPath),
    ]),
    "oo-find-skills": createAgentDefinitions([
        createAgenticMarkdownFile("SKILL.md", ooFindSkillsSkillPath),
        createAgenticMarkdownFile("references/oo-cli-contract.md", ooFindSkillsCliContractPath),
    ]),
    "oo-publish-skill": createAgentDefinitions([
        createAgenticMarkdownFile("SKILL.md", ooPublishSkillPath),
    ]),
} as const satisfies Record<
    BundledSkillName,
    Record<BundledSkillAgentName, BundledSkillDefinition>
>;

export function getBundledSkillFiles(
    skillName: BundledSkillName,
    agentName: BundledSkillAgentName = "universal",
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
    const agent = readManagedSkillAgent(file.agentName);
    const variables: Record<string, string> = {
        agent: file.agentName,
        agentTitle: agent.title,
    };

    if (agent.skillSelectionPromptTool !== undefined) {
        variables.skillSelectionPromptTool = agent.skillSelectionPromptTool;
    }

    return render(content, variables);
}

function createAgentDefinitions(
    files: readonly BundledSkillSourceFile[],
): Record<BundledSkillAgentName, BundledSkillDefinition> {
    return Object.fromEntries(
        availableBundledSkillAgentNames.map(agentName => [
            agentName,
            { files } satisfies BundledSkillDefinition,
        ]),
    ) as Record<BundledSkillAgentName, BundledSkillDefinition>;
}

function createOoReferenceFiles(sourcePaths: {
    authAndBilling: string;
    connectorExecution: string;
    fileTransfer: string;
    llmClient: string;
    searchAndSelection: string;
}): readonly BundledSkillSourceFile[] {
    return [
        createAgenticMarkdownFile("references/auth-and-billing.md", sourcePaths.authAndBilling),
        createAgenticMarkdownFile("references/llm-client.md", sourcePaths.llmClient),
        createAgenticMarkdownFile("references/search-and-selection.md", sourcePaths.searchAndSelection),
        createAgenticMarkdownFile("references/connector-execution.md", sourcePaths.connectorExecution),
        createAgenticMarkdownFile("references/file-transfer.md", sourcePaths.fileTransfer),
    ];
}

function createAgenticMarkdownFile(
    relativePath: string,
    sourcePath: string,
): BundledSkillSourceFile {
    return {
        relativePath,
        sourcePath,
    };
}
