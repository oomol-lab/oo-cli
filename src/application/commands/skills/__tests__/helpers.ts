import type { BundledSkillName } from "../embedded-assets.ts";
import {
    getBundledSkillFiles,
} from "../embedded-assets.ts";

export function getBundledSkillSourcePath(
    skillName: BundledSkillName,
    relativePath: string,
): string {
    const file = getBundledSkillFiles(skillName).find(file => file.relativePath === relativePath);

    if (file === undefined) {
        throw new Error(`Missing bundled skill file: ${skillName}/${relativePath}`);
    }

    return file.sourcePath;
}
