import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { SkillAutoTriggerPolicy } from "./auto-trigger-policy.ts";
import type { BundledSkillName } from "./embedded-assets.ts";
import type {
    ManagedSkillHost,
    ManagedSkillHostInstallation,
} from "./managed-skill-hosts.ts";
import type { RegistrySkillMetadata } from "./skill-metadata.ts";

import { join } from "node:path";
import { readSkillAutoTriggerPolicy } from "./auto-trigger-policy.ts";
import {
    publishBundledSkillInstallation,
} from "./bundled-skill-filesystem.ts";
import {
    resolveBundledSkillCanonicalDirectoryPath,
} from "./bundled-skill-paths.ts";
import {
    availableBundledSkillNames,
    bundledSkillDevelopmentVersion,
} from "./embedded-assets.ts";
import {
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallation,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import { readSkillsDirectoryEntries } from "./managed-skill-listings.ts";
import {
    isManagedSkillPathContained,
    resolveManagedSkillCanonicalRootDirectoryPath,
} from "./managed-skill-paths.ts";
import { publishManagedBundledSkill } from "./shared.ts";
import {
    isBundledSkillDirectoryWritable,
    managedMetadataOfKind,
    readSkillDirectoryState,
} from "./skill-directory-state.ts";

interface CanonicalRegistrySkill {
    metadata: RegistrySkillMetadata;
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

// The policy is read here rather than by the caller so that a settings file
// this run cannot parse fails only the bundled half. Registry synchronization
// does not depend on the policy, and awaiting the read while the caller builds
// its `Promise.all` array would stop it from ever being started.
async function synchronizeBundledSkills(
    hosts: readonly ManagedSkillHost[],
    context: SkillSyncContext,
): Promise<void> {
    const autoTriggerPolicy = await readSkillAutoTriggerPolicy(
        context.settingsStore,
    );

    await Promise.all(
        hosts.flatMap(host =>
            availableBundledSkillNames.map(skillName =>
                synchronizeBundledSkill(host, skillName, context, autoTriggerPolicy),
            ),
        ),
    );
}

async function synchronizeBundledSkill(
    host: ManagedSkillHost,
    skillName: BundledSkillName,
    context: SkillSyncContext,
    autoTriggerPolicy: SkillAutoTriggerPolicy,
): Promise<void> {
    const settingsFilePath = context.settingsStore.getFilePath();
    const installation = resolveManagedSkillHostInstallation(host, skillName);

    try {
        const targetState = await readSkillDirectoryState(
            installation.installedSkillDirectoryPath,
        );
        if (
            !isBundledSkillDirectoryWritable(targetState, {
                reclaimNonDirectory: false,
            })
        ) {
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

        const installedMetadata = managedMetadataOfKind(targetState, "bundled");

        if (installedMetadata?.version === context.version) {
            return;
        }

        if (installedMetadata?.version === bundledSkillDevelopmentVersion) {
            context.logger.info(
                {
                    agentName: host.agentName,
                    path: installation.installedSkillDirectoryPath,
                    skillName,
                    version: context.version,
                },
                "Bundled skill startup synchronization skipped because the installed skill is a development version.",
            );
            return;
        }

        if (
            installedMetadata !== undefined
            && context.version === bundledSkillDevelopmentVersion
        ) {
            context.logger.info(
                {
                    agentName: host.agentName,
                    path: installation.installedSkillDirectoryPath,
                    previousVersion: installedMetadata.version,
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

        const installedSkillDirectoryPath = await publishManagedBundledSkill({
            agentName: host.agentName,
            autoTriggerPolicy,
            homeDirectory: host.homeDirectory,
            settingsFilePath,
            skillName,
            version: context.version,
        });

        context.logger.info(
            {
                agentName: host.agentName,
                canonicalPath: canonicalSkillDirectoryPath,
                path: installedSkillDirectoryPath,
                previousVersion: installedMetadata?.version,
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
    const canonicalState = await readSkillDirectoryState(
        canonicalSkillDirectoryPath,
    );

    if (
        isBundledSkillDirectoryWritable(canonicalState, {
            reclaimNonDirectory: false,
        })
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

        const targetState = await readSkillDirectoryState(
            installation.installedSkillDirectoryPath,
        );
        const installedMetadata = managedMetadataOfKind(targetState, "registry");

        if (targetState.kind !== "missing" && installedMetadata === undefined) {
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

        if (installedMetadata !== undefined) {
            if (
                installedMetadata.packageName !== skill.metadata.packageName
                || installedMetadata.version !== skill.metadata.version
            ) {
                context.logger.warn(
                    {
                        agentName: installation.agentName,
                        canonicalPackageName: skill.metadata.packageName,
                        canonicalVersion: skill.metadata.version,
                        path: installation.installedSkillDirectoryPath,
                        skillName: skill.name,
                        targetPackageName: installedMetadata.packageName,
                        targetVersion: installedMetadata.version,
                    },
                    "Registry skill startup synchronization skipped because the target metadata does not match canonical metadata.",
                );
                return;
            }

            return;
        }

        await publishBundledSkillInstallation({
            canonicalSkillDirectoryPath: skill.path,
            installedSkillDirectoryPath: installation.installedSkillDirectoryPath,
        });

        context.logger.info(
            {
                agentName: installation.agentName,
                canonicalPath: skill.path,
                packageName: skill.metadata.packageName,
                path: installation.installedSkillDirectoryPath,
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
    const canonicalRootDirectoryPath = resolveManagedSkillCanonicalRootDirectoryPath(
        context.settingsStore.getFilePath(),
    );
    const entries = await readSkillsDirectoryEntries(canonicalRootDirectoryPath);
    const skills = await Promise.all(
        entries.map(async (entryName) => {
            const canonicalSkillDirectoryPath = join(
                canonicalRootDirectoryPath,
                entryName,
            );

            try {
                const canonicalMetadata = managedMetadataOfKind(
                    await readSkillDirectoryState(canonicalSkillDirectoryPath),
                    "registry",
                );

                if (canonicalMetadata === undefined) {
                    return undefined;
                }

                return {
                    metadata: canonicalMetadata,
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
