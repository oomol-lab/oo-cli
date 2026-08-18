import type { SkillAutoTriggerPolicy } from "./auto-trigger-policy.ts";
import type { BundledSkillAgentName } from "./managed-skill-agents.ts";
import { mkdir } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { render } from "agentic-markdown";

import ooCreateSkillOpenAiPolicyPath from "../../../../contrib/skills/shared/oo-create-skill/agents/openai.yaml" with { type: "file" };
import ooCreateSkillExistingWorkflowPath from "../../../../contrib/skills/shared/oo-create-skill/references/existing-workflow.md" with { type: "file" };
import ooCreateSkillOoPoweredPath from "../../../../contrib/skills/shared/oo-create-skill/references/oo-powered.md" with { type: "file" };
import ooCreateSkillAuthoringPath from "../../../../contrib/skills/shared/oo-create-skill/references/skill-authoring.md" with { type: "file" };
import ooCreateSkillPath from "../../../../contrib/skills/shared/oo-create-skill/SKILL.md" with { type: "file" };

import ooFindSkillsOpenAiPolicyPath from "../../../../contrib/skills/shared/oo-find-skills/agents/openai.yaml" with { type: "file" };
import ooFindSkillsCliContractPath from "../../../../contrib/skills/shared/oo-find-skills/references/oo-cli-contract.md" with { type: "file" };
import ooFindSkillsSkillPath from "../../../../contrib/skills/shared/oo-find-skills/SKILL.md" with { type: "file" };
import ooPublishSkillOpenAiPolicyPath from "../../../../contrib/skills/shared/oo-publish-skill/agents/openai.yaml" with { type: "file" };
import ooPublishSkillPath from "../../../../contrib/skills/shared/oo-publish-skill/SKILL.md" with { type: "file" };
import ooOpenAiPolicyPath from "../../../../contrib/skills/shared/oo/agents/openai.yaml" with { type: "file" };
import ooAuthAndBillingReferencePath from "../../../../contrib/skills/shared/oo/references/auth-and-billing.md" with { type: "file" };
import ooConnectorExecutionReferencePath from "../../../../contrib/skills/shared/oo/references/connector-execution.md" with { type: "file" };
import ooFileTransferReferencePath from "../../../../contrib/skills/shared/oo/references/file-transfer.md" with { type: "file" };
import ooFlowAuthoringReferencePath from "../../../../contrib/skills/shared/oo/references/flow-authoring.md" with { type: "file" };
import ooLlmClientReferencePath from "../../../../contrib/skills/shared/oo/references/llm-client.md" with { type: "file" };
import ooSearchAndSelectionReferencePath from "../../../../contrib/skills/shared/oo/references/search-and-selection.md" with { type: "file" };
import ooSkillPath from "../../../../contrib/skills/shared/oo/SKILL.md" with { type: "file" };
import {
    createSkillAutoTriggerRenderVariables,
    defaultSkillAutoTriggerPolicy,
    isSkillAutoTriggerEnabled,
} from "./auto-trigger-policy.ts";
import { removePath } from "./bundled-skill-filesystem.ts";

import {
    availableBundledSkillAgentNames,
    readManagedSkillAgent,
} from "./managed-skill-agents.ts";

export { availableBundledSkillAgentNames } from "./managed-skill-agents.ts";
export type { BundledSkillAgentName } from "./managed-skill-agents.ts";

export const availableBundledSkillNames = ["oo", "oo-find-skills", "oo-create-skill", "oo-publish-skill"] as const;
export type BundledSkillName = (typeof availableBundledSkillNames)[number];

// Version recorded for bundled skills installed from a development build.
export const bundledSkillDevelopmentVersion = "0.0.0-development";

interface BundledSkillSourceFile {
    // Portable logical path used by skill references; convert it only when
    // materializing to the local filesystem.
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

// `agents/openai.yaml` is part of every bundled skill regardless of the
// auto-trigger policy: the file always states the policy explicitly, so the
// file list stays static and switching the policy never has to add or remove a
// file from an already-published skill directory.
const openAiPolicyRelativePath = posix.join("agents", "openai.yaml");

const bundledSkillRegistry = {
    "oo": createAgentDefinitions([
        createRenderedBundledSkillFile("SKILL.md", ooSkillPath),
        createRenderedBundledSkillFile(openAiPolicyRelativePath, ooOpenAiPolicyPath),
        ...createOoReferenceFiles({
            authAndBilling: ooAuthAndBillingReferencePath,
            connectorExecution: ooConnectorExecutionReferencePath,
            fileTransfer: ooFileTransferReferencePath,
            flowAuthoring: ooFlowAuthoringReferencePath,
            llmClient: ooLlmClientReferencePath,
            searchAndSelection: ooSearchAndSelectionReferencePath,
        }),
    ]),
    "oo-create-skill": createAgentDefinitions([
        createRenderedBundledSkillFile("SKILL.md", ooCreateSkillPath),
        createRenderedBundledSkillFile(openAiPolicyRelativePath, ooCreateSkillOpenAiPolicyPath),
        createRenderedBundledSkillFile(posix.join("references", "skill-authoring.md"), ooCreateSkillAuthoringPath),
        createRenderedBundledSkillFile(posix.join("references", "existing-workflow.md"), ooCreateSkillExistingWorkflowPath),
        createRenderedBundledSkillFile(posix.join("references", "oo-powered.md"), ooCreateSkillOoPoweredPath),
    ]),
    "oo-find-skills": createAgentDefinitions([
        createRenderedBundledSkillFile("SKILL.md", ooFindSkillsSkillPath),
        createRenderedBundledSkillFile(openAiPolicyRelativePath, ooFindSkillsOpenAiPolicyPath),
        createRenderedBundledSkillFile("references/oo-cli-contract.md", ooFindSkillsCliContractPath),
    ]),
    "oo-publish-skill": createAgentDefinitions([
        createRenderedBundledSkillFile("SKILL.md", ooPublishSkillPath),
        createRenderedBundledSkillFile(openAiPolicyRelativePath, ooPublishSkillOpenAiPolicyPath),
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

// Materialize a bundled skill into an arbitrary directory rendered for the
// given agent format. This is a pure export: it writes only inside
// `targetSkillDirectoryPath`, never touches the oo app-data canonical storage
// or any agent home directory, and writes no `.oo-metadata.json` management
// marker. The per-skill directory is removed and recreated so stale files from
// a previous export do not linger; sibling content in the parent directory is
// left untouched. Returns the written file relative paths in registry order.
//
// The export deliberately renders at the shipped auto-trigger default rather
// than this machine's policy. The output is a portable artifact — vendored into
// a repository, inspected, handed to someone else — and none of the commands
// that manage the policy can reach it afterwards, so baking one installation's
// preference into it would travel silently to everyone who consumed it.
export async function materializeBundledSkillToDirectory(options: {
    agentName: BundledSkillAgentName;
    skillName: BundledSkillName;
    targetSkillDirectoryPath: string;
}): Promise<readonly string[]> {
    await removePath(options.targetSkillDirectoryPath);
    await mkdir(options.targetSkillDirectoryPath, { recursive: true });

    const files = getBundledSkillFiles(options.skillName, options.agentName);

    for (const file of files) {
        const destinationPath = join(
            options.targetSkillDirectoryPath,
            file.relativePath,
        );

        await mkdir(dirname(destinationPath), { recursive: true });
        await Bun.write(destinationPath, await readBundledSkillFileContent(file));
    }

    return files.map(file => file.relativePath);
}

// Renders one bundled skill file for its agent. `agentic-markdown` throws on a
// referenced variable it was not given, so every variable used by any bundled
// template has to be supplied here. The auto-trigger policy defaults to the
// shipped default rather than being required: an omitted policy means "nothing
// has been configured", which is exactly what the default expresses.
export async function readBundledSkillFileContent(
    file: BundledSkillFile,
    autoTriggerPolicy: SkillAutoTriggerPolicy = defaultSkillAutoTriggerPolicy,
): Promise<string> {
    const content = await Bun.file(file.sourcePath).text();
    const agent = readManagedSkillAgent(file.agentName);
    const variables: Record<string, string> = {
        agent: file.agentName,
        agentTitle: agent.title,
        ...createSkillAutoTriggerRenderVariables(
            isSkillAutoTriggerEnabled(autoTriggerPolicy, file.skillName),
        ),
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
    flowAuthoring: string;
    llmClient: string;
    searchAndSelection: string;
}): readonly BundledSkillSourceFile[] {
    return [
        createRenderedBundledSkillFile("references/auth-and-billing.md", sourcePaths.authAndBilling),
        createRenderedBundledSkillFile("references/llm-client.md", sourcePaths.llmClient),
        createRenderedBundledSkillFile("references/flow-authoring.md", sourcePaths.flowAuthoring),
        createRenderedBundledSkillFile("references/search-and-selection.md", sourcePaths.searchAndSelection),
        createRenderedBundledSkillFile("references/connector-execution.md", sourcePaths.connectorExecution),
        createRenderedBundledSkillFile("references/file-transfer.md", sourcePaths.fileTransfer),
    ];
}

function createRenderedBundledSkillFile(
    relativePath: string,
    sourcePath: string,
): BundledSkillSourceFile {
    return {
        relativePath,
        sourcePath,
    };
}
