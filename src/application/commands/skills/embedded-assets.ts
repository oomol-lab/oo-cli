import ooFindSkillsOpenAIAgentPath from "../../../../contrib/skills/codex/oo-find-skills/agents/openai.yaml" with { type: "file" };
import ooFindSkillsCliContractPath from "../../../../contrib/skills/codex/oo-find-skills/references/oo-cli-contract.md" with { type: "file" };
import ooFindSkillsSkillPath from "../../../../contrib/skills/codex/oo-find-skills/SKILL.md" with { type: "file" };
import ooOpenAIAgentPath from "../../../../contrib/skills/codex/oo/agents/openai.yaml" with { type: "file" };
import ooCliContractPath from "../../../../contrib/skills/codex/oo/references/oo-cli-contract.md" with { type: "file" };
import ooSkillPath from "../../../../contrib/skills/codex/oo/SKILL.md" with { type: "file" };

export const availableBundledSkillAgentNames = ["codex"] as const;
export type BundledSkillAgentName = (typeof availableBundledSkillAgentNames)[number];

export const availableBundledSkillNames = ["oo", "oo-find-skills"] as const;
export type BundledSkillName = (typeof availableBundledSkillNames)[number];

interface BundledSkillSourceFile {
    readonly relativePath: string;
    readonly sourcePath: string;
}

interface BundledSkillDefinition {
    readonly agentName: BundledSkillAgentName;
    readonly files: readonly BundledSkillSourceFile[];
}

interface BundledSkillFile extends BundledSkillSourceFile {
    readonly agentName: BundledSkillAgentName;
    readonly skillName: BundledSkillName;
}

// Keep this registry aligned with contrib/skills/<agent>/<skill> so Bun embeds the files.
const bundledSkillRegistry = {
    "oo": {
        agentName: "codex",
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
    "oo-find-skills": {
        agentName: "codex",
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
} as const satisfies Record<BundledSkillName, BundledSkillDefinition>;

export function getBundledSkillAgentName(
    skillName: BundledSkillName,
): BundledSkillAgentName {
    return bundledSkillRegistry[skillName].agentName;
}

export function getBundledSkillSourceDirectory(skillName: BundledSkillName): string {
    return `contrib/skills/${getBundledSkillAgentName(skillName)}/${skillName}`;
}

export function getBundledSkillFiles(
    skillName: BundledSkillName,
): readonly BundledSkillFile[] {
    const skillDefinition = bundledSkillRegistry[skillName];

    return skillDefinition.files.map(file => ({
        ...file,
        agentName: skillDefinition.agentName,
        skillName,
    }));
}
