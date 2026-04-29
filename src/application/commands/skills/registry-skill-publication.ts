import type { BundledSkillPublicationResult } from "./bundled-skill-filesystem.ts";
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
import { directoryExists } from "./bundled-skill-observation.ts";
import {
    readManagedSkillMetadata,
    writeManagedSkillMetadata,
} from "./managed-skill-metadata.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import { resolveManagedSkillPublicationMode } from "./managed-skill-publication.ts";
import { requireExtractedRegistrySkillDirectory } from "./registry-skill-archive.ts";
import { rewriteInstalledRegistrySkillMarkdown } from "./registry-skill-markdown.ts";

export interface PreparedRegistrySkillPublication {
    canonicalSkillDirectoryPath: string;
    hostInstallations: ManagedSkillHostInstallation[];
    packageName: string;
    packageVersion: string;
    skillName: string;
}

export interface RegistrySkillPublicationResult extends BundledSkillPublicationResult {
    agentName: BundledSkillAgentName;
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
    await validateRegistrySkillPublicationTargets(preparedPublication);

    return Promise.all(
        preparedPublication.hostInstallations.map(async (installation) => {
            const publication = await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath: preparedPublication.canonicalSkillDirectoryPath,
                installedSkillDirectoryPath: installation.installedSkillDirectoryPath,
                publicationMode: resolveManagedSkillPublicationMode(
                    installation.agentName,
                ),
            });

            return {
                ...publication,
                agentName: installation.agentName,
            };
        }),
    );
}

export async function validateRegistrySkillPublicationTargets(options: {
    hostInstallations: readonly ManagedSkillHostInstallation[];
    skillName: string;
}): Promise<void> {
    const targetStates = await Promise.all(
        options.hostInstallations.map(async (installation) => {
            const installedDirectoryExists = await directoryExists(
                installation.installedSkillDirectoryPath,
            );

            return {
                installation,
                installedDirectoryExists,
                metadata: installedDirectoryExists
                    ? await readManagedSkillMetadata(
                            installation.installedSkillDirectoryPath,
                        )
                    : undefined,
            };
        }),
    );
    const unmanagedTarget = targetStates.find(
        target => target.installedDirectoryExists && target.metadata === undefined,
    );

    if (unmanagedTarget === undefined) {
        return;
    }

    throw new CliUserError("errors.skills.nameConflict", 1, {
        name: options.skillName,
        path: unmanagedTarget.installation.installedSkillDirectoryPath,
    });
}
