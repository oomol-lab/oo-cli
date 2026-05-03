import type { CliExecutionContext } from "../../contracts/cli.ts";

import type { BundledSkillPublicationResult } from "./bundled-skill-filesystem.ts";
import type {
    BundledSkillAgentName,
    BundledSkillName,
} from "./embedded-assets.ts";
import type {
    ManagedSkillInstallPublication,
    ManagedSkillInstallSummary,
} from "./install-output.ts";
import type { ManagedSkillHostInstallation } from "./managed-skill-hosts.ts";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import {
    publishBundledSkillInstallation,
    removePath,
} from "./bundled-skill-filesystem.ts";
import { resolveBundledSkillInstallConflict } from "./bundled-skill-model.ts";
import {
    directoryExists,
    isManagedBundledSkillInstallation,
    writeInstalledBundledSkillMetadata,
} from "./bundled-skill-observation.ts";
import {
    resolveBundledSkillCanonicalDirectoryPath,
    resolveBundledSkillDirectoryPath,
} from "./bundled-skill-paths.ts";
import {
    availableBundledSkillNames,
    getBundledSkillFiles,
} from "./embedded-assets.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallation,
} from "./managed-skill-hosts.ts";
import { resolveManagedSkillPublicationMode } from "./managed-skill-publication.ts";

export interface BundledSkillHostInstallation extends ManagedSkillHostInstallation {
    canonicalSkillDirectoryPath: string;
}

export async function installBundledSkill(
    skillName: BundledSkillName,
    context: CliExecutionContext,
): Promise<ManagedSkillInstallSummary> {
    const installations = await resolveAvailableBundledSkillHostInstallations(
        context,
        skillName,
    );

    if (installations.length === 0) {
        throw createMissingManagedSkillHostError(context.env);
    }

    for (const installation of installations) {
        await validateBundledSkillInstallationTarget(
            skillName,
            installation,
            context,
        );
    }

    const publications: ManagedSkillInstallPublication[] = [];

    for (const installation of installations) {
        const publishedInstallation = await publishManagedBundledSkill({
            agentName: installation.agentName,
            homeDirectory: installation.homeDirectory,
            settingsFilePath: context.settingsStore.getFilePath(),
            skillName,
            version: context.version,
        });

        publications.push({
            agentName: installation.agentName,
            path: publishedInstallation.path,
        });
        context.logger.info(
            {
                agentName: installation.agentName,
                canonicalPath: installation.canonicalSkillDirectoryPath,
                installMode: publishedInstallation.mode,
                path: publishedInstallation.path,
                skillName,
                version: context.version,
            },
            "Bundled skill installed explicitly.",
        );
    }

    return {
        name: skillName,
        publications,
    };
}

export async function publishManagedBundledSkill(options: {
    agentName: BundledSkillAgentName;
    homeDirectory: string;
    settingsFilePath: string;
    skillName: BundledSkillName;
    version: string;
}): Promise<BundledSkillPublicationResult> {
    const installationPaths = await writeBundledSkillCanonicalInstallation(options);

    return publishBundledSkillInstallation({
        ...installationPaths,
        publicationMode: resolveManagedSkillPublicationMode(options.agentName),
    });
}

export async function resolveAvailableBundledSkillHostInstallations(
    context: Pick<CliExecutionContext, "env" | "settingsStore">,
    skillName: BundledSkillName,
): Promise<BundledSkillHostInstallation[]> {
    const settingsFilePath = context.settingsStore.getFilePath();
    const hosts = await resolveAvailableManagedSkillHosts(context.env);

    return hosts.map(host => ({
        ...resolveManagedSkillHostInstallation(host, skillName),
        canonicalSkillDirectoryPath: resolveBundledSkillCanonicalDirectoryPath(
            settingsFilePath,
            skillName,
            host.agentName,
        ),
    }) satisfies BundledSkillHostInstallation);
}

export function isBundledSkillName(value: string): value is BundledSkillName {
    return availableBundledSkillNames.includes(value as BundledSkillName);
}

async function writeBundledSkillCanonicalInstallation(options: {
    agentName: BundledSkillAgentName;
    homeDirectory: string;
    settingsFilePath: string;
    skillName: BundledSkillName;
    version: string;
}): Promise<{
    canonicalSkillDirectoryPath: string;
    installedSkillDirectoryPath: string;
}> {
    const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
        options.settingsFilePath,
        options.skillName,
        options.agentName,
    );
    const installedSkillDirectoryPath = resolveBundledSkillDirectoryPath(
        options.homeDirectory,
        options.skillName,
    );

    await removePath(canonicalSkillDirectoryPath);
    await mkdir(canonicalSkillDirectoryPath, { recursive: true });

    for (const file of getBundledSkillFiles(options.skillName, options.agentName)) {
        const destinationPath = join(
            canonicalSkillDirectoryPath,
            file.relativePath,
        );

        await mkdir(dirname(destinationPath), { recursive: true });
        await Bun.write(destinationPath, Bun.file(file.sourcePath));
    }

    await writeInstalledBundledSkillMetadata(
        canonicalSkillDirectoryPath,
        {
            version: options.version,
        },
    );

    return {
        canonicalSkillDirectoryPath,
        installedSkillDirectoryPath,
    };
}

async function validateBundledSkillInstallationTarget(
    skillName: BundledSkillName,
    installation: BundledSkillHostInstallation,
    context: Pick<CliExecutionContext, "logger">,
): Promise<void> {
    const installedSkillDirectoryExists = await directoryExists(
        installation.installedSkillDirectoryPath,
    );

    if (installedSkillDirectoryExists) {
        const installedSkillDirectoryManaged
            = await isManagedBundledSkillInstallation(
                installation.installedSkillDirectoryPath,
            );

        if (resolveBundledSkillInstallConflict({
            canonicalDirectoryExists: false,
            canonicalDirectoryManaged: false,
            installedDirectoryExists: true,
            installedDirectoryManaged: installedSkillDirectoryManaged,
        }) === "nameConflict") {
            context.logger.warn(
                {
                    agentName: installation.agentName,
                    path: installation.installedSkillDirectoryPath,
                    skillName,
                },
                "Bundled skill install was blocked by an unmanaged directory.",
            );
            throw new CliUserError("errors.skills.nameConflict", 1, {
                name: skillName,
                path: installation.installedSkillDirectoryPath,
            });
        }
    }

    const canonicalSkillDirectoryExists = await directoryExists(
        installation.canonicalSkillDirectoryPath,
    );

    if (!canonicalSkillDirectoryExists) {
        return;
    }

    const canonicalSkillDirectoryManaged
        = await isManagedBundledSkillInstallation(
            installation.canonicalSkillDirectoryPath,
        );

    if (resolveBundledSkillInstallConflict({
        canonicalDirectoryExists: true,
        canonicalDirectoryManaged: canonicalSkillDirectoryManaged,
        installedDirectoryExists: false,
        installedDirectoryManaged: false,
    }) !== "storageConflict") {
        return;
    }

    context.logger.warn(
        {
            agentName: installation.agentName,
            path: installation.canonicalSkillDirectoryPath,
            skillName,
        },
        "Bundled skill install was blocked by an unmanaged canonical directory.",
    );
    throw new CliUserError("errors.skills.storageConflict", 1, {
        name: skillName,
        path: installation.canonicalSkillDirectoryPath,
    });
}
