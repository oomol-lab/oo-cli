import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CliUserError } from "../../contracts/cli.ts";
import {
    directoryExists,
    fileExists,
} from "./bundled-skill-observation.ts";

export interface ExtractedRegistryPackageArchive {
    cleanup: () => Promise<void>;
    rootDirectoryPath: string;
    skillsDirectoryPath: string;
}

export async function extractRegistryPackageArchive(
    bytes: Uint8Array<ArrayBuffer>,
): Promise<ExtractedRegistryPackageArchive> {
    const rootDirectoryPath = await mkdtemp(
        join(tmpdir(), "oo-registry-skill-"),
    );
    const archive = new Bun.Archive(bytes);

    await archive.extract(rootDirectoryPath);

    return {
        cleanup: async () => {
            await rm(rootDirectoryPath, { force: true, recursive: true });
        },
        rootDirectoryPath,
        skillsDirectoryPath: join(
            rootDirectoryPath,
            "package",
            "package",
            "skills",
        ),
    };
}

export async function requireExtractedRegistrySkillDirectory(
    archive: Pick<ExtractedRegistryPackageArchive, "skillsDirectoryPath">,
    skillName: string,
): Promise<string> {
    const skillDirectoryPath = join(archive.skillsDirectoryPath, skillName);
    const skillFilePath = join(skillDirectoryPath, "SKILL.md");

    if (
        !(await directoryExists(skillDirectoryPath))
        || !(await fileExists(skillFilePath))
    ) {
        throw new CliUserError("errors.skills.install.invalidArchive", 1, {
            name: skillName,
        });
    }

    return skillDirectoryPath;
}
