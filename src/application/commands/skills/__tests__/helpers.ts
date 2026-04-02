import type {
    BundledSkillAgentName,
    BundledSkillName,
} from "../embedded-assets.ts";
import {
    getBundledSkillFiles,
} from "../embedded-assets.ts";

export function getBundledSkillSourcePath(
    skillName: BundledSkillName,
    relativePath: string,
    agentName: BundledSkillAgentName = "codex",
): string {
    const file = getBundledSkillFiles(skillName, agentName).find(file =>
        file.relativePath === relativePath,
    );

    if (file === undefined) {
        throw new Error(
            `Missing bundled skill file: ${agentName}/${skillName}/${relativePath}`,
        );
    }

    return file.sourcePath;
}
