import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";
import type { ManagedSkillHostInstallation } from "./managed-skill-hosts.ts";
import type { ExtractedRegistryPackageArchive } from "./registry-skill-archive.ts";
import type { RegistrySkillSummary } from "./registry-skill-source.ts";

import { cp, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import {
    publishBundledSkillInstallation,
    removePath,
} from "./bundled-skill-filesystem.ts";
import {
    writeManagedSkillMetadata,
} from "./managed-skill-metadata.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import { requireExtractedRegistrySkillDirectory } from "./registry-skill-archive.ts";
import { rewriteInstalledRegistrySkillMarkdown } from "./registry-skill-markdown.ts";
import { readSkillDirectoryState } from "./skill-directory-state.ts";

export interface PreparedRegistrySkillPublication {
    canonicalSkillDirectoryPath: string;
    hostInstallations: ManagedSkillHostInstallation[];
    packageName: string;
    packageVersion: string;
    skillName: string;
}

export interface RegistrySkillPublicationResult {
    agentName: BundledSkillAgentName;
    path: string;
}

export async function prepareRegistrySkillPublication(options: {
    extractedPackage: ExtractedRegistryPackageArchive;
    hostInstallations: readonly ManagedSkillHostInstallation[];
    packageName: string;
    packageVersion: string;
    settingsFilePath: string;
    skill: RegistrySkillSummary;
    skillName: string;
}): Promise<PreparedRegistrySkillPublication> {
    const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        options.settingsFilePath,
        options.skillName,
    );

    await removePath(canonicalSkillDirectoryPath);
    await mkdir(dirname(canonicalSkillDirectoryPath), { recursive: true });
    await cp(
        await requireExtractedRegistrySkillDirectory(
            options.extractedPackage,
            options.skillName,
        ),
        canonicalSkillDirectoryPath,
        {
            force: true,
            recursive: true,
        },
    );
    await rewriteInstalledRegistrySkillMarkdown(
        canonicalSkillDirectoryPath,
        options.skill,
        options.packageName,
    );
    await writeManagedSkillMetadata(
        canonicalSkillDirectoryPath,
        {
            packageName: options.packageName,
            version: options.packageVersion,
        },
    );

    return {
        canonicalSkillDirectoryPath,
        hostInstallations: [...options.hostInstallations],
        packageName: options.packageName,
        packageVersion: options.packageVersion,
        skillName: options.skillName,
    };
}

export async function publishPreparedRegistrySkillPublication(
    preparedPublication: PreparedRegistrySkillPublication,
): Promise<RegistrySkillPublicationResult[]> {
    // Callers are expected to call validateRegistrySkillPublicationTargets
    // beforehand so the conflict warning fires exactly once per host.
    return Promise.all(
        preparedPublication.hostInstallations.map(async (installation) => {
            await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath: preparedPublication.canonicalSkillDirectoryPath,
                installedSkillDirectoryPath: installation.installedSkillDirectoryPath,
            });

            return {
                agentName: installation.agentName,
                path: installation.installedSkillDirectoryPath,
            };
        }),
    );
}

export async function validateRegistrySkillPublicationTargets(options: {
    context?: Pick<CliExecutionContext, "logger">;
    force?: boolean;
    hostInstallations: readonly ManagedSkillHostInstallation[];
    skillName: string;
}): Promise<void> {
    const targetStates = await Promise.all(
        options.hostInstallations.map(async installation => ({
            installation,
            state: await readSkillDirectoryState(
                installation.installedSkillDirectoryPath,
            ),
        })),
    );
    const unmanagedTargets = targetStates.filter(
        target => target.state.kind === "unmanaged"
            || (target.state.kind === "managed"
                && target.state.metadata.kind !== "registry"),
    );

    if (unmanagedTargets.length === 0) {
        return;
    }

    if (options.force === true) {
        for (const target of unmanagedTargets) {
            options.context?.logger.warn(
                {
                    agentName: target.installation.agentName,
                    path: target.installation.installedSkillDirectoryPath,
                    skillName: options.skillName,
                },
                "Forcefully overwriting unmanaged registry skill directory because --force was set.",
            );
        }
        return;
    }

    throw new CliUserError("errors.skills.nameConflict", 1, {
        name: options.skillName,
        path: unmanagedTargets[0]!.installation.installedSkillDirectoryPath,
    });
}
