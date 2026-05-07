import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { BundledSkillName } from "./embedded-assets.ts";
import type {
    ManagedSkillHost,
    ManagedSkillHostInstallation,
} from "./managed-skill-hosts.ts";
import type { ManagedSkillMetadata } from "./managed-skill-metadata.ts";

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathExists } from "../../shared/fs-utils.ts";
import {
    isNodeNotFoundError,
    publishBundledSkillInstallation,
} from "./bundled-skill-filesystem.ts";
import {
    bundledSkillDevelopmentVersion,
} from "./bundled-skill-model.ts";
import {
    directoryExists,
    isManagedBundledSkillInstallation,
    readInstalledBundledSkillMetadata,
} from "./bundled-skill-observation.ts";
import {
    resolveBundledSkillCanonicalDirectoryPath,
} from "./bundled-skill-paths.ts";
import {
    availableBundledSkillNames,
} from "./embedded-assets.ts";
import {
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallation,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import {
    readManagedSkillMetadata,
} from "./managed-skill-metadata.ts";
import {
    isManagedSkillPathContained,
    resolveManagedSkillCanonicalRootDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    isManagedSkillPublicationCurrent,
    resolveManagedSkillPublicationMode,
} from "./managed-skill-publication.ts";
import { publishManagedBundledSkill } from "./shared.ts";

interface ManagedSkillTargetState<Metadata> {
    kind: "managed" | "missing" | "unmanaged";
    metadata?: Metadata;
}

interface CanonicalRegistrySkill {
    metadata: ManagedSkillMetadata & {
        packageName: string;
    };
    name: string;
    path: string;
}

type SkillSyncContext = Pick<
    CliExecutionContext,
    "env" | "logger" | "settingsStore" | "version"
>;

export async function synchronizeManagedSkillsForAvailableHosts(
    context: SkillSyncContext,
): Promise<void> {
    try {
        const hosts = await resolveAvailableManagedSkillHosts(context.env);

        if (hosts.length === 0) {
            return;
        }

        await Promise.all([
            synchronizeBundledSkills(hosts, context),
            synchronizeRegistrySkills(hosts, context),
        ]);
    }
    catch (error) {
        context.logger.warn(
            {
                err: error,
            },
            "Managed skill startup synchronization failed.",
        );
    }
}

async function synchronizeBundledSkills(
    hosts: readonly ManagedSkillHost[],
    context: SkillSyncContext,
): Promise<void> {
    await Promise.all(
        hosts.flatMap(host =>
            availableBundledSkillNames.map(skillName =>
                synchronizeBundledSkill(host, skillName, context),
            ),
        ),
    );
}

async function synchronizeBundledSkill(
    host: ManagedSkillHost,
    skillName: BundledSkillName,
    context: SkillSyncContext,
): Promise<void> {
    const settingsFilePath = context.settingsStore.getFilePath();
    const installation = resolveManagedSkillHostInstallation(host, skillName);

    try {
        const targetState = await readManagedSkillTargetState(
            installation.installedSkillDirectoryPath,
            readInstalledBundledSkillMetadata,
        );

        if (targetState.kind === "unmanaged") {
            context.logger.warn(
                {
                    agentName: host.agentName,
                    path: installation.installedSkillDirectoryPath,
                    skillName,
                },
                "Bundled skill startup synchronization skipped because the target is not managed by oo.",
            );
            return;
        }

        if (
            targetState.kind === "managed"
            && targetState.metadata?.version === context.version
        ) {
            return;
        }

        if (
            targetState.kind === "managed"
            && context.version === bundledSkillDevelopmentVersion
        ) {
            context.logger.info(
                {
                    agentName: host.agentName,
                    path: installation.installedSkillDirectoryPath,
                    previousVersion: targetState.metadata?.version,
                    skillName,
                    version: context.version,
                },
                "Bundled skill startup synchronization skipped because the current CLI version is a development version.",
            );
            return;
        }

        const canonicalSkillDirectoryPath
            = resolveBundledSkillCanonicalDirectoryPath(
                settingsFilePath,
                skillName,
                host.agentName,
            );

        if (
            !(await canWriteBundledCanonicalSkill(
                canonicalSkillDirectoryPath,
                host,
                skillName,
                context,
            ))
        ) {
            return;
        }

        const publication = await publishManagedBundledSkill({
            agentName: host.agentName,
            homeDirectory: host.homeDirectory,
            settingsFilePath,
            skillName,
            version: context.version,
        });

        context.logger.info(
            {
                agentName: host.agentName,
                canonicalPath: canonicalSkillDirectoryPath,
                installMode: publication.mode,
                path: publication.path,
                previousVersion: targetState.metadata?.version,
                skillName,
                version: context.version,
            },
            "Bundled skill synchronized during CLI startup.",
        );
    }
    catch (error) {
        context.logger.warn(
            {
                agentName: host.agentName,
                err: error,
                path: installation.installedSkillDirectoryPath,
                skillName,
            },
            "Bundled skill startup synchronization failed.",
        );
    }
}

async function canWriteBundledCanonicalSkill(
    canonicalSkillDirectoryPath: string,
    host: ManagedSkillHost,
    skillName: BundledSkillName,
    context: SkillSyncContext,
): Promise<boolean> {
    if (!(await pathExists(canonicalSkillDirectoryPath))) {
        return true;
    }

    if (
        await directoryExists(canonicalSkillDirectoryPath)
        && await isManagedBundledSkillInstallation(canonicalSkillDirectoryPath)
    ) {
        return true;
    }

    context.logger.warn(
        {
            agentName: host.agentName,
            path: canonicalSkillDirectoryPath,
            skillName,
        },
        "Bundled skill startup synchronization skipped because canonical storage is not managed by oo.",
    );

    return false;
}

async function synchronizeRegistrySkills(
    hosts: readonly ManagedSkillHost[],
    context: SkillSyncContext,
): Promise<void> {
    const skills = await listCanonicalRegistrySkills(context);

    await Promise.all(
        skills.flatMap(skill =>
            resolveManagedSkillHostInstallations(hosts, skill.name).map(
                installation =>
                    synchronizeRegistrySkill(installation, skill, context),
            ),
        ),
    );
}

async function synchronizeRegistrySkill(
    installation: ManagedSkillHostInstallation,
    skill: CanonicalRegistrySkill,
    context: SkillSyncContext,
): Promise<void> {
    try {
        if (
            !isManagedSkillPathContained(
                installation.homeDirectory,
                context.settingsStore.getFilePath(),
                skill.name,
            )
        ) {
            context.logger.warn(
                {
                    agentName: installation.agentName,
                    skillName: skill.name,
                },
                "Registry skill startup synchronization skipped because the target path is outside the managed skills directory.",
            );
            return;
        }

        const targetState = await readManagedSkillTargetState(
            installation.installedSkillDirectoryPath,
            readManagedSkillMetadata,
        );
        const publicationMode = resolveManagedSkillPublicationMode(
            installation.agentName,
        );

        if (targetState.kind === "unmanaged") {
            context.logger.warn(
                {
                    agentName: installation.agentName,
                    path: installation.installedSkillDirectoryPath,
                    skillName: skill.name,
                },
                "Registry skill startup synchronization skipped because the target is not managed by oo.",
            );
            return;
        }

        if (targetState.kind === "managed") {
            if (
                targetState.metadata?.packageName !== skill.metadata.packageName
                || targetState.metadata.version !== skill.metadata.version
            ) {
                context.logger.warn(
                    {
                        agentName: installation.agentName,
                        canonicalPackageName: skill.metadata.packageName,
                        canonicalVersion: skill.metadata.version,
                        path: installation.installedSkillDirectoryPath,
                        skillName: skill.name,
                        targetPackageName: targetState.metadata?.packageName,
                        targetVersion: targetState.metadata?.version,
                    },
                    "Registry skill startup synchronization skipped because the target metadata does not match canonical metadata.",
                );
                return;
            }

            if (
                await isManagedSkillPublicationCurrent(
                    installation.installedSkillDirectoryPath,
                    publicationMode,
                )
            ) {
                return;
            }
        }

        const publication = await publishBundledSkillInstallation({
            canonicalSkillDirectoryPath: skill.path,
            installedSkillDirectoryPath: installation.installedSkillDirectoryPath,
            publicationMode,
        });

        context.logger.info(
            {
                agentName: installation.agentName,
                canonicalPath: skill.path,
                installMode: publication.mode,
                packageName: skill.metadata.packageName,
                path: publication.path,
                skillName: skill.name,
                version: skill.metadata.version,
            },
            "Registry skill synchronized during CLI startup.",
        );
    }
    catch (error) {
        context.logger.warn(
            {
                agentName: installation.agentName,
                err: error,
                path: installation.installedSkillDirectoryPath,
                skillName: skill.name,
            },
            "Registry skill startup synchronization failed.",
        );
    }
}

async function listCanonicalRegistrySkills(
    context: Pick<SkillSyncContext, "logger" | "settingsStore">,
): Promise<CanonicalRegistrySkill[]> {
    const canonicalRootDirectoryPath
        = resolveManagedSkillCanonicalRootDirectoryPath(
            context.settingsStore.getFilePath(),
        );
    let entries: string[];

    try {
        entries = (await readdir(canonicalRootDirectoryPath, {
            withFileTypes: true,
        }))
            .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
            .map(entry => entry.name);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return [];
        }

        throw error;
    }

    const skills = await Promise.all(
        entries.map(async (entryName) => {
            const canonicalSkillDirectoryPath = join(
                canonicalRootDirectoryPath,
                entryName,
            );

            try {
                if (!(await directoryExists(canonicalSkillDirectoryPath))) {
                    return undefined;
                }

                const metadata = await readManagedSkillMetadata(
                    canonicalSkillDirectoryPath,
                );

                if (metadata?.packageName === undefined) {
                    return undefined;
                }

                return {
                    metadata: {
                        packageName: metadata.packageName,
                        version: metadata.version,
                    },
                    name: entryName,
                    path: canonicalSkillDirectoryPath,
                } satisfies CanonicalRegistrySkill;
            }
            catch (error) {
                context.logger.warn(
                    {
                        err: error,
                        path: canonicalSkillDirectoryPath,
                        skillName: entryName,
                    },
                    "Canonical registry skill inspection failed during startup synchronization.",
                );

                return undefined;
            }
        }),
    );

    return skills.filter(skill => skill !== undefined);
}

async function readManagedSkillTargetState<Metadata>(
    skillDirectoryPath: string,
    readMetadata: (path: string) => Promise<Metadata | undefined>,
): Promise<ManagedSkillTargetState<Metadata>> {
    if (!(await pathExists(skillDirectoryPath))) {
        return {
            kind: "missing",
        };
    }

    if (!(await directoryExists(skillDirectoryPath))) {
        return {
            kind: "unmanaged",
        };
    }

    const metadata = await readMetadata(skillDirectoryPath);

    if (metadata === undefined) {
        return {
            kind: "unmanaged",
        };
    }

    return {
        kind: "managed",
        metadata,
    };
}
