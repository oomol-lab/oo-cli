import type { BundledSkillMetadata } from "./bundled-skill-model.ts";
import type { BundledSkillAgentName, BundledSkillName } from "./embedded-assets.ts";

import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import {
    isBundledSkillInstallationCurrentState,
    parseBundledSkillMetadataContent,
    readImplicitInvocationValue,
} from "./bundled-skill-model.ts";
import {
    resolveBundledSkillHomeDirectory,
    resolveBundledSkillMetadataFilePath,
    resolveBundledSkillOwnershipFileRelativePath,
} from "./bundled-skill-paths.ts";
import { getBundledSkillFiles } from "./embedded-assets.ts";
import { renderSkillMetadataJson } from "./skill-metadata.ts";

export async function requireBundledSkillHomeDirectory(
    context: Pick<{ env: Record<string, string | undefined> }, "env">,
    agentName: BundledSkillAgentName,
): Promise<string> {
    const homeDirectory = resolveBundledSkillHomeDirectory(
        context.env,
        agentName,
    );

    if (!(await directoryExists(homeDirectory))) {
        throw new CliUserError(
            agentName === "claude"
                ? "errors.skills.claudeNotInstalled"
                : "errors.skills.codexNotInstalled",
            1,
            {
                path: homeDirectory,
            },
        );
    }

    return homeDirectory;
}

export async function requireCodexHomeDirectory(
    context: Pick<{ env: Record<string, string | undefined> }, "env">,
): Promise<string> {
    return requireBundledSkillHomeDirectory(context, "codex");
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
    agentName: BundledSkillAgentName = "codex",
): Promise<boolean | undefined> {
    const ownershipFileRelativePath = resolveBundledSkillOwnershipFileRelativePath(
        agentName,
    );

    if (ownershipFileRelativePath === undefined) {
        return undefined;
    }

    try {
        const content = await readFile(
            join(skillDirectoryPath, ownershipFileRelativePath),
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
    agentName: BundledSkillAgentName = "codex",
): Promise<boolean> {
    const metadata = await readInstalledBundledSkillMetadata(skillDirectoryPath);

    return isBundledSkillInstallationCurrentFromMetadata(
        skillName,
        skillDirectoryPath,
        metadata,
        version,
        agentName,
    );
}

export async function isBundledSkillInstallationCurrentFromMetadata(
    skillName: BundledSkillName,
    skillDirectoryPath: string,
    metadata: BundledSkillMetadata | undefined,
    version: string,
    agentName: BundledSkillAgentName = "codex",
): Promise<boolean> {
    const managedInstallation = metadata !== undefined;
    const installedVersion = metadata?.version;
    let hasAllBundledFiles = false;

    if (installedVersion === version) {
        hasAllBundledFiles = true;

        for (const file of getBundledSkillFiles(skillName, agentName)) {
            if (!(await fileExists(join(skillDirectoryPath, file.relativePath)))) {
                hasAllBundledFiles = false;
                break;
            }
        }
    }

    return isBundledSkillInstallationCurrentState({
        hasAllBundledFiles,
        hasMetadataFile: managedInstallation,
        installedVersion,
        isManagedInstallation: managedInstallation,
        version,
    });
}
