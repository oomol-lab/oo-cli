import ooFindSkillsOpenAIAgentPath from "../../../../contrib/skills/oo-find-skills/agents/openai.yaml" with { type: "file" };
import ooFindSkillsCliContractPath from "../../../../contrib/skills/oo-find-skills/references/oo-cli-contract.md" with { type: "file" };
import ooFindSkillsSkillPath from "../../../../contrib/skills/oo-find-skills/SKILL.md" with { type: "file" };
import ooOpenAIAgentPath from "../../../../contrib/skills/oo/agents/openai.yaml" with { type: "file" };
import ooCliContractPath from "../../../../contrib/skills/oo/references/oo-cli-contract.md" with { type: "file" };
import ooSkillPath from "../../../../contrib/skills/oo/SKILL.md" with { type: "file" };

export const availableBundledSkillNames = ["oo", "oo-find-skills"] as const;

export type BundledSkillName = (typeof availableBundledSkillNames)[number];

interface BundledSkillFile {
    readonly relativePath: string;
    readonly skillName: BundledSkillName;
    readonly sourcePath: string;
}

// Keep this list aligned with contrib/skills so Bun embeds the skill files.
const bundledSkillFiles = [
    {
        relativePath: "SKILL.md",
        skillName: "oo",
        sourcePath: ooSkillPath,
    },
    {
        relativePath: "agents/openai.yaml",
        skillName: "oo",
        sourcePath: ooOpenAIAgentPath,
    },
    {
        relativePath: "references/oo-cli-contract.md",
        skillName: "oo",
        sourcePath: ooCliContractPath,
    },
    {
        relativePath: "SKILL.md",
        skillName: "oo-find-skills",
        sourcePath: ooFindSkillsSkillPath,
    },
    {
        relativePath: "agents/openai.yaml",
        skillName: "oo-find-skills",
        sourcePath: ooFindSkillsOpenAIAgentPath,
    },
    {
        relativePath: "references/oo-cli-contract.md",
        skillName: "oo-find-skills",
        sourcePath: ooFindSkillsCliContractPath,
    },
] as const satisfies readonly BundledSkillFile[];

export function getBundledSkillFiles(
    skillName: BundledSkillName,
): readonly BundledSkillFile[] {
    return bundledSkillFiles.filter(file => file.skillName === skillName);
}
