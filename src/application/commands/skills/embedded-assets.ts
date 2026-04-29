import ooCreateSkillClaudeSkillPath from "../../../../contrib/skills/claude/oo-create-skill/SKILL.md" with { type: "file" };
import ooFindSkillsClaudeCliContractPath from "../../../../contrib/skills/claude/oo-find-skills/references/oo-cli-contract.md" with { type: "file" };
import ooFindSkillsClaudeSkillPath from "../../../../contrib/skills/claude/oo-find-skills/SKILL.md" with { type: "file" };
import ooClaudeAuthAndBillingReferencePath from "../../../../contrib/skills/claude/oo/references/auth-and-billing.md" with { type: "file" };
import ooClaudeConnectorExecutionReferencePath from "../../../../contrib/skills/claude/oo/references/connector-execution.md" with { type: "file" };
import ooClaudeFileTransferReferencePath from "../../../../contrib/skills/claude/oo/references/file-transfer.md" with { type: "file" };
import ooClaudePackageExecutionReferencePath from "../../../../contrib/skills/claude/oo/references/package-execution.md" with { type: "file" };
import ooClaudeSearchAndSelectionReferencePath from "../../../../contrib/skills/claude/oo/references/search-and-selection.md" with { type: "file" };
import ooClaudeTaskLifecycleReferencePath from "../../../../contrib/skills/claude/oo/references/task-lifecycle.md" with { type: "file" };
import ooClaudeSkillPath from "../../../../contrib/skills/claude/oo/SKILL.md" with { type: "file" };
import ooCreateSkillOpenAIAgentPath from "../../../../contrib/skills/codex/oo-create-skill/agents/openai.yaml" with { type: "file" };
import ooCreateSkillPath from "../../../../contrib/skills/codex/oo-create-skill/SKILL.md" with { type: "file" };
import ooFindSkillsOpenAIAgentPath from "../../../../contrib/skills/codex/oo-find-skills/agents/openai.yaml" with { type: "file" };
import ooFindSkillsCliContractPath from "../../../../contrib/skills/codex/oo-find-skills/references/oo-cli-contract.md" with { type: "file" };
import ooFindSkillsSkillPath from "../../../../contrib/skills/codex/oo-find-skills/SKILL.md" with { type: "file" };
import ooOpenAIAgentPath from "../../../../contrib/skills/codex/oo/agents/openai.yaml" with { type: "file" };
import ooAuthAndBillingReferencePath from "../../../../contrib/skills/codex/oo/references/auth-and-billing.md" with { type: "file" };
import ooConnectorExecutionReferencePath from "../../../../contrib/skills/codex/oo/references/connector-execution.md" with { type: "file" };
import ooFileTransferReferencePath from "../../../../contrib/skills/codex/oo/references/file-transfer.md" with { type: "file" };
import ooPackageExecutionReferencePath from "../../../../contrib/skills/codex/oo/references/package-execution.md" with { type: "file" };
import ooSearchAndSelectionReferencePath from "../../../../contrib/skills/codex/oo/references/search-and-selection.md" with { type: "file" };
import ooTaskLifecycleReferencePath from "../../../../contrib/skills/codex/oo/references/task-lifecycle.md" with { type: "file" };
import ooSkillPath from "../../../../contrib/skills/codex/oo/SKILL.md" with { type: "file" };
import ooCreateSkillOpenClawSkillPath from "../../../../contrib/skills/openclaw/oo-create-skill/SKILL.md" with { type: "file" };
import ooFindSkillsOpenClawCliContractPath from "../../../../contrib/skills/openclaw/oo-find-skills/references/oo-cli-contract.md" with { type: "file" };
import ooFindSkillsOpenClawSkillPath from "../../../../contrib/skills/openclaw/oo-find-skills/SKILL.md" with { type: "file" };
import ooOpenClawAuthAndBillingReferencePath from "../../../../contrib/skills/openclaw/oo/references/auth-and-billing.md" with { type: "file" };
import ooOpenClawConnectorExecutionReferencePath from "../../../../contrib/skills/openclaw/oo/references/connector-execution.md" with { type: "file" };
import ooOpenClawFileTransferReferencePath from "../../../../contrib/skills/openclaw/oo/references/file-transfer.md" with { type: "file" };
import ooOpenClawPackageExecutionReferencePath from "../../../../contrib/skills/openclaw/oo/references/package-execution.md" with { type: "file" };
import ooOpenClawSearchAndSelectionReferencePath from "../../../../contrib/skills/openclaw/oo/references/search-and-selection.md" with { type: "file" };
import ooOpenClawTaskLifecycleReferencePath from "../../../../contrib/skills/openclaw/oo/references/task-lifecycle.md" with { type: "file" };
import ooOpenClawSkillPath from "../../../../contrib/skills/openclaw/oo/SKILL.md" with { type: "file" };
import ooCreateSkillQoderWorkSkillPath from "../../../../contrib/skills/qoderwork/oo-create-skill/SKILL.md" with { type: "file" };
import ooFindSkillsQoderWorkCliContractPath from "../../../../contrib/skills/qoderwork/oo-find-skills/references/oo-cli-contract.md" with { type: "file" };
import ooFindSkillsQoderWorkSkillPath from "../../../../contrib/skills/qoderwork/oo-find-skills/SKILL.md" with { type: "file" };
import ooQoderWorkAuthAndBillingReferencePath from "../../../../contrib/skills/qoderwork/oo/references/auth-and-billing.md" with { type: "file" };
import ooQoderWorkConnectorExecutionReferencePath from "../../../../contrib/skills/qoderwork/oo/references/connector-execution.md" with { type: "file" };
import ooQoderWorkFileTransferReferencePath from "../../../../contrib/skills/qoderwork/oo/references/file-transfer.md" with { type: "file" };
import ooQoderWorkPackageExecutionReferencePath from "../../../../contrib/skills/qoderwork/oo/references/package-execution.md" with { type: "file" };
import ooQoderWorkSearchAndSelectionReferencePath from "../../../../contrib/skills/qoderwork/oo/references/search-and-selection.md" with { type: "file" };
import ooQoderWorkTaskLifecycleReferencePath from "../../../../contrib/skills/qoderwork/oo/references/task-lifecycle.md" with { type: "file" };
import ooQoderWorkSkillPath from "../../../../contrib/skills/qoderwork/oo/SKILL.md" with { type: "file" };

export const availableBundledSkillAgentNames = ["codex", "claude", "openclaw", "qoderwork"] as const;
export type BundledSkillAgentName = (typeof availableBundledSkillAgentNames)[number];

export const availableBundledSkillNames = ["oo", "oo-find-skills", "oo-create-skill"] as const;
export type BundledSkillName = (typeof availableBundledSkillNames)[number];

interface BundledSkillSourceFile {
    readonly relativePath: string;
    readonly sourcePath: string;
}

interface BundledSkillDefinition {
    readonly files: readonly BundledSkillSourceFile[];
}

interface BundledSkillFile extends BundledSkillSourceFile {
    readonly agentName: BundledSkillAgentName;
    readonly skillName: BundledSkillName;
}

const ooCodexReferenceFiles = createOoReferenceFiles({
    authAndBilling: ooAuthAndBillingReferencePath,
    connectorExecution: ooConnectorExecutionReferencePath,
    fileTransfer: ooFileTransferReferencePath,
    packageExecution: ooPackageExecutionReferencePath,
    searchAndSelection: ooSearchAndSelectionReferencePath,
    taskLifecycle: ooTaskLifecycleReferencePath,
});
const ooClaudeCompatibleReferenceFiles = createOoReferenceFiles({
    authAndBilling: ooClaudeAuthAndBillingReferencePath,
    connectorExecution: ooClaudeConnectorExecutionReferencePath,
    fileTransfer: ooClaudeFileTransferReferencePath,
    packageExecution: ooClaudePackageExecutionReferencePath,
    searchAndSelection: ooClaudeSearchAndSelectionReferencePath,
    taskLifecycle: ooClaudeTaskLifecycleReferencePath,
});
const ooOpenClawReferenceFiles = createOoReferenceFiles({
    authAndBilling: ooOpenClawAuthAndBillingReferencePath,
    connectorExecution: ooOpenClawConnectorExecutionReferencePath,
    fileTransfer: ooOpenClawFileTransferReferencePath,
    packageExecution: ooOpenClawPackageExecutionReferencePath,
    searchAndSelection: ooOpenClawSearchAndSelectionReferencePath,
    taskLifecycle: ooOpenClawTaskLifecycleReferencePath,
});
const ooQoderWorkReferenceFiles = createOoReferenceFiles({
    authAndBilling: ooQoderWorkAuthAndBillingReferencePath,
    connectorExecution: ooQoderWorkConnectorExecutionReferencePath,
    fileTransfer: ooQoderWorkFileTransferReferencePath,
    packageExecution: ooQoderWorkPackageExecutionReferencePath,
    searchAndSelection: ooQoderWorkSearchAndSelectionReferencePath,
    taskLifecycle: ooQoderWorkTaskLifecycleReferencePath,
});

// Keep this registry aligned with contrib/skills/<agent>/<skill> so Bun embeds the files.
const bundledSkillRegistry = {
    "oo": {
        codex: {
            files: [
                {
                    relativePath: "SKILL.md",
                    sourcePath: ooSkillPath,
                },
                {
                    relativePath: "agents/openai.yaml",
                    sourcePath: ooOpenAIAgentPath,
                },
                ...ooCodexReferenceFiles,
            ],
        },
        claude: {
            files: [
                {
                    relativePath: "SKILL.md",
                    sourcePath: ooClaudeSkillPath,
                },
                ...ooClaudeCompatibleReferenceFiles,
            ],
        },
        openclaw: {
            files: [
                {
                    relativePath: "SKILL.md",
                    sourcePath: ooOpenClawSkillPath,
                },
                ...ooOpenClawReferenceFiles,
            ],
        },
        qoderwork: {
            files: [
                {
                    relativePath: "SKILL.md",
                    sourcePath: ooQoderWorkSkillPath,
                },
                ...ooQoderWorkReferenceFiles,
            ],
        },
    },
    "oo-find-skills": {
        codex: {
            files: [
                {
                    relativePath: "SKILL.md",
                    sourcePath: ooFindSkillsSkillPath,
                },
                {
                    relativePath: "agents/openai.yaml",
                    sourcePath: ooFindSkillsOpenAIAgentPath,
                },
                {
                    relativePath: "references/oo-cli-contract.md",
                    sourcePath: ooFindSkillsCliContractPath,
                },
            ],
        },
        claude: {
            files: [
                {
                    relativePath: "SKILL.md",
                    sourcePath: ooFindSkillsClaudeSkillPath,
                },
                {
                    relativePath: "references/oo-cli-contract.md",
                    sourcePath: ooFindSkillsClaudeCliContractPath,
                },
            ],
        },
        openclaw: {
            files: [
                {
                    relativePath: "SKILL.md",
                    sourcePath: ooFindSkillsOpenClawSkillPath,
                },
                {
                    relativePath: "references/oo-cli-contract.md",
                    sourcePath: ooFindSkillsOpenClawCliContractPath,
                },
            ],
        },
        qoderwork: {
            files: [
                {
                    relativePath: "SKILL.md",
                    sourcePath: ooFindSkillsQoderWorkSkillPath,
                },
                {
                    relativePath: "references/oo-cli-contract.md",
                    sourcePath: ooFindSkillsQoderWorkCliContractPath,
                },
            ],
        },
    },
    "oo-create-skill": {
        codex: {
            files: [
                {
                    relativePath: "SKILL.md",
                    sourcePath: ooCreateSkillPath,
                },
                {
                    relativePath: "agents/openai.yaml",
                    sourcePath: ooCreateSkillOpenAIAgentPath,
                },
            ],
        },
        claude: {
            files: [
                {
                    relativePath: "SKILL.md",
                    sourcePath: ooCreateSkillClaudeSkillPath,
                },
            ],
        },
        openclaw: {
            files: [
                {
                    relativePath: "SKILL.md",
                    sourcePath: ooCreateSkillOpenClawSkillPath,
                },
            ],
        },
        qoderwork: {
            files: [
                {
                    relativePath: "SKILL.md",
                    sourcePath: ooCreateSkillQoderWorkSkillPath,
                },
            ],
        },
    },
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

function createOoReferenceFiles(sourcePaths: {
    authAndBilling: string;
    connectorExecution: string;
    fileTransfer: string;
    packageExecution: string;
    searchAndSelection: string;
    taskLifecycle: string;
}): readonly BundledSkillSourceFile[] {
    return [
        {
            relativePath: "references/auth-and-billing.md",
            sourcePath: sourcePaths.authAndBilling,
        },
        {
            relativePath: "references/search-and-selection.md",
            sourcePath: sourcePaths.searchAndSelection,
        },
        {
            relativePath: "references/package-execution.md",
            sourcePath: sourcePaths.packageExecution,
        },
        {
            relativePath: "references/connector-execution.md",
            sourcePath: sourcePaths.connectorExecution,
        },
        {
            relativePath: "references/file-transfer.md",
            sourcePath: sourcePaths.fileTransfer,
        },
        {
            relativePath: "references/task-lifecycle.md",
            sourcePath: sourcePaths.taskLifecycle,
        },
    ] as const satisfies readonly BundledSkillSourceFile[];
}
