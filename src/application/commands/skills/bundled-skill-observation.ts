import type { BundledSkillMetadata } from "./bundled-skill-model.ts";
import type { BundledSkillName } from "./embedded-assets.ts";

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import {
    isBundledSkillInstallationCurrentState,
    parseBundledSkillMetadataContent,
    readImplicitInvocationValue,
    renderSkillMetadataJson,
} from "./bundled-skill-model.ts";
import {
    bundledSkillOwnershipFileRelativePath,
    resolveBundledSkillMetadataFilePath,
    resolveCodexHomeDirectory,
} from "./bundled-skill-paths.ts";
import { getBundledSkillFiles } from "./embedded-assets.ts";

export async function requireCodexHomeDirectory(
    context: Pick<{ env: Record<string, string | undefined> }, "env">,
): Promise<string> {
    const codexHomeDirectory = resolveCodexHomeDirectory(context.env);

    if (!(await directoryExists(codexHomeDirectory))) {
        throw new CliUserError("errors.skills.codexNotInstalled", 1, {
            path: codexHomeDirectory,
        });
    }

    return codexHomeDirectory;
}

export async function directoryExists(path: string): Promise<boolean> {
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

export async function fileExists(path: string): Promise<boolean> {
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

export async function readInstalledBundledSkillImplicitInvocation(
    skillDirectoryPath: string,
): Promise<boolean | undefined> {
    try {
        const content = await readFile(
            join(skillDirectoryPath, bundledSkillOwnershipFileRelativePath),
            "utf8",
        );

        return readImplicitInvocationValue(content);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }
}

export async function isManagedBundledSkillInstallation(
    skillDirectoryPath: string,
): Promise<boolean> {
    return (await readInstalledBundledSkillMetadata(skillDirectoryPath)) !== undefined;
}

export async function readInstalledBundledSkillVersion(
    skillDirectoryPath: string,
): Promise<string | undefined> {
    const metadata = await readInstalledBundledSkillMetadata(skillDirectoryPath);

    return metadata?.version;
}

export async function readInstalledBundledSkillMetadata(
    skillDirectoryPath: string,
): Promise<BundledSkillMetadata | undefined> {
    try {
        const content = await readFile(
            resolveBundledSkillMetadataFilePath(skillDirectoryPath),
            "utf8",
        );

        return parseBundledSkillMetadataContent(content);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }
}

export async function writeInstalledBundledSkillMetadata(
    skillDirectoryPath: string,
    metadata: BundledSkillMetadata,
): Promise<void> {
    await Bun.write(
        resolveBundledSkillMetadataFilePath(skillDirectoryPath),
        renderSkillMetadataJson(metadata),
    );
}

export async function isBundledSkillInstallationCurrent(
    skillName: BundledSkillName,
    skillDirectoryPath: string,
    version: string,
): Promise<boolean> {
    const metadata = await readInstalledBundledSkillMetadata(skillDirectoryPath);
    const managedInstallation = metadata !== undefined;
    const hasMetadataFile = managedInstallation;
    const installedVersion = metadata?.version;
    let hasAllBundledFiles = false;

    if (installedVersion === version) {
        hasAllBundledFiles = true;

        for (const file of getBundledSkillFiles(skillName)) {
            if (!(await fileExists(join(skillDirectoryPath, file.relativePath)))) {
                hasAllBundledFiles = false;
                break;
            }
        }
    }

    return isBundledSkillInstallationCurrentState({
        hasAllBundledFiles,
        hasMetadataFile,
        installedVersion,
        isManagedInstallation: managedInstallation,
        version,
    });
}
