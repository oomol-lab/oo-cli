import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CliUserError } from "../../contracts/cli.ts";

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

async function directoryExists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isDirectory();
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
}

async function fileExists(path: string): Promise<boolean> {
    try {
        return (await stat(path)).isFile();
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
}

function isNodeNotFoundError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}
