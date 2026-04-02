import ooFindSkillsClaudeCliContractPath from "../../../../contrib/skills/claude/oo-find-skills/references/oo-cli-contract.md" with { type: "file" };
import ooFindSkillsClaudeSkillPath from "../../../../contrib/skills/claude/oo-find-skills/SKILL.md" with { type: "file" };
import ooClaudeCliContractPath from "../../../../contrib/skills/claude/oo/references/oo-cli-contract.md" with { type: "file" };
import ooClaudeSkillPath from "../../../../contrib/skills/claude/oo/SKILL.md" with { type: "file" };
import ooFindSkillsOpenAIAgentPath from "../../../../contrib/skills/codex/oo-find-skills/agents/openai.yaml" with { type: "file" };
import ooFindSkillsCliContractPath from "../../../../contrib/skills/codex/oo-find-skills/references/oo-cli-contract.md" with { type: "file" };
import ooFindSkillsSkillPath from "../../../../contrib/skills/codex/oo-find-skills/SKILL.md" with { type: "file" };
import ooOpenAIAgentPath from "../../../../contrib/skills/codex/oo/agents/openai.yaml" with { type: "file" };
import ooCliContractPath from "../../../../contrib/skills/codex/oo/references/oo-cli-contract.md" with { type: "file" };
import ooSkillPath from "../../../../contrib/skills/codex/oo/SKILL.md" with { type: "file" };

export const availableBundledSkillAgentNames = ["codex", "claude"] as const;
export type BundledSkillAgentName = (typeof availableBundledSkillAgentNames)[number];

export const availableBundledSkillNames = ["oo", "oo-find-skills"] as const;
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
                {
                    relativePath: "references/oo-cli-contract.md",
                    sourcePath: ooCliContractPath,
                },
            ],
        },
        claude: {
            files: [
                {
                    relativePath: "SKILL.md",
                    sourcePath: ooClaudeSkillPath,
                },
                {
                    relativePath: "references/oo-cli-contract.md",
                    sourcePath: ooClaudeCliContractPath,
                },
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
    },
} as const satisfies Record<
    BundledSkillName,
    Record<BundledSkillAgentName, BundledSkillDefinition>
>;

export function getBundledSkillAgentNames(
    skillName: BundledSkillName,
): readonly BundledSkillAgentName[] {
    return Object.keys(
        bundledSkillRegistry[skillName],
    ) as BundledSkillAgentName[];
}

export function getBundledSkillSourceDirectory(
    skillName: BundledSkillName,
    agentName: BundledSkillAgentName = "codex",
): string {
    return `contrib/skills/${agentName}/${skillName}`;
}

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
