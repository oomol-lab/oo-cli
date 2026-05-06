import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";

export async function readSkillFileContent(
    skillDirectoryPath: string,
): Promise<string | undefined> {
    try {
        return await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8");
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }
}

export async function hasMatchingSkillFileContent(options: {
    expectedContent: string;
    skillDirectoryPath: string;
}): Promise<boolean> {
    return await readSkillFileContent(options.skillDirectoryPath)
        === options.expectedContent;
}
