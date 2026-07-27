import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { CliUserError } from "../../contracts/cli.ts";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import { resolveManagedSkillMetadataFilePath } from "./managed-skill-paths.ts";
import {
    createLocalSkillMetadata,
    parseSkillMetadataContent,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

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

export async function writeLocalSkillMetadata(
    skillDirectoryPath: string,
): Promise<void> {
    const metadataFilePath = resolveManagedSkillMetadataFilePath(skillDirectoryPath);
    const desiredContent = renderSkillMetadataJson(createLocalSkillMetadata());

    try {
        const currentContent = await readFile(metadataFilePath, "utf8");
        const currentMetadata = parseSkillMetadataContent(currentContent);

        if (currentMetadata?.kind !== "local") {
            throw new CliUserError("errors.skills.nameConflict", 1, {
                name: basename(skillDirectoryPath),
                path: skillDirectoryPath,
            });
        }

        if (currentContent === desiredContent) {
            return;
        }
    }
    catch (error) {
        if (!isNodeNotFoundError(error)) {
            throw error;
        }
    }

    await Bun.write(metadataFilePath, desiredContent);
}
