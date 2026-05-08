import { lstat } from "node:fs/promises";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";

export async function isManagedSkillPublicationCurrent(
    skillDirectoryPath: string,
): Promise<boolean> {
    try {
        return !(await lstat(skillDirectoryPath)).isSymbolicLink();
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
}
