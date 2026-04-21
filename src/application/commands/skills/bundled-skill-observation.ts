import type { BundledSkillMetadata } from "./bundled-skill-model.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";

import { readFile, stat } from "node:fs/promises";
import { CliUserError } from "../../contracts/cli.ts";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import {
    parseBundledSkillMetadataContent,
} from "./bundled-skill-model.ts";
import {
    resolveBundledSkillHomeDirectory,
    resolveBundledSkillMetadataFilePath,
} from "./bundled-skill-paths.ts";
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

export async function isManagedBundledSkillInstallation(
    skillDirectoryPath: string,
): Promise<boolean> {
    return (await readInstalledBundledSkillMetadata(skillDirectoryPath)) !== undefined;
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
