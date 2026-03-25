import ooOpenAIAgentPath from "../../../../contrib/skills/oo/agents/openai.yaml" with { type: "file" };
import ooCliContractPath from "../../../../contrib/skills/oo/references/oo-cli-contract.md" with { type: "file" };
import ooSkillPath from "../../../../contrib/skills/oo/SKILL.md" with { type: "file" };

export const availableBundledSkillNames = ["oo"] as const;

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
] as const satisfies readonly BundledSkillFile[];

export function getBundledSkillFiles(
    skillName: BundledSkillName,
): readonly BundledSkillFile[] {
    return bundledSkillFiles.filter(file => file.skillName === skillName);
}
