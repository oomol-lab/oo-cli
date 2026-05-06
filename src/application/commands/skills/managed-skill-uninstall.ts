import type { CliExecutionContext } from "../../contracts/cli.ts";

import type {
    BundledSkillName,
} from "./embedded-assets.ts";
import type { ManagedSkillHostInstallation } from "./managed-skill-hosts.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { writeLine } from "../shared/output.ts";
import {
    removePath,
} from "./bundled-skill-filesystem.ts";
import {
    canUninstallManagedBundledSkillInstallation,
} from "./bundled-skill-model.ts";
import {
    directoryExists,
    readInstalledBundledSkillMetadata,
} from "./bundled-skill-observation.ts";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import {
    hasMatchingSkillFileContent,
    readSkillFileContent,
} from "./local-skill-ownership.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import { readManagedSkillMetadata } from "./managed-skill-metadata.ts";
import {
    isLocalSkillPathContained,
    isManagedSkillPathContained,
    isPathWithinDirectory,
    resolveLocalSkillCanonicalDirectoryPath,
    resolveLocalSkillCanonicalRootDirectoryPath,
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    isBundledSkillName,
    resolveAvailableBundledSkillHostInstallations,
} from "./shared.ts";

interface RegistrySkillUninstallTarget extends ManagedSkillHostInstallation {
    packageName: string | undefined;
    previousVersion: string | undefined;
}

export interface ManagedSkillUninstallResult {
    missingInstallationPath: string | undefined;
    noSupportedHosts: boolean;
    removed: boolean;
    unmanagedInstallations: readonly ManagedSkillHostInstallation[];
}

export async function uninstallRequestedSkill(
    skillName: string | undefined,
    context: CliExecutionContext,
): Promise<void> {
    if (skillName === undefined) {
        for (const bundledSkillName of availableBundledSkillNames) {
            await uninstallBundledSkill(bundledSkillName, context);
        }
        return;
    }

    if (isBundledSkillName(skillName)) {
        await uninstallBundledSkill(skillName, context);
        return;
    }

    const registryResult = await uninstallRegistrySkill(skillName, context);
    const localResult = await uninstallLocalSkill(skillName, context);

    if (localResult.unmanagedInstallations.length > 0) {
        throw createManagedSkillUninstallResultError({
            context,
            logMessage:
                "Local skill uninstall skipped because no OOMOL ownership was found.",
            result: localResult,
            skillName,
        });
    }

    if (registryResult.removed || localResult.removed) {
        return;
    }

    const result = registryResult.unmanagedInstallations.length > 0
        ? registryResult
        : localResult;

    throw createManagedSkillUninstallResultError({
        context,
        logMessage:
            "Managed registry skill uninstall skipped because no OOMOL metadata was found.",
        result,
        skillName,
    });
}

export async function uninstallBundledSkill(
    skillName: BundledSkillName,
    context: CliExecutionContext,
): Promise<void> {
    const installations = await resolveAvailableBundledSkillHostInstallations(
        context,
        skillName,
    );

    if (installations.length === 0) {
        throw createMissingManagedSkillHostError(context.env);
    }

    const uninstallTargets: Array<
        (typeof installations)[number] & {
            previousVersion: string | undefined;
        }
    > = [];

    for (const installation of installations) {
        const installedSkillDirectoryExists = await directoryExists(
            installation.installedSkillDirectoryPath,
        );
        const installedSkillMetadata = installedSkillDirectoryExists
            ? await readInstalledBundledSkillMetadata(
                    installation.installedSkillDirectoryPath,
                )
            : undefined;

        if (!canUninstallManagedBundledSkillInstallation({
            installedDirectoryExists: installedSkillDirectoryExists,
            installedDirectoryManaged: installedSkillMetadata !== undefined,
        })) {
            if (!installedSkillDirectoryExists) {
                continue;
            }

            context.logger.warn(
                {
                    agentName: installation.agentName,
                    path: installation.installedSkillDirectoryPath,
                    skillName,
                },
                "Bundled skill uninstall skipped because no managed installation was found.",
            );
            throw createManagedSkillUninstallError({
                installedDirectoryExists: true,
                path: installation.installedSkillDirectoryPath,
                skillName,
            });
        }

        uninstallTargets.push({
            ...installation,
            previousVersion: installedSkillMetadata?.version,
        });
    }

    if (uninstallTargets.length === 0) {
        throw createManagedSkillUninstallError({
            installedDirectoryExists: false,
            path: installations[0]!.installedSkillDirectoryPath,
            skillName,
        });
    }

    for (const target of uninstallTargets) {
        await Promise.all([
            removePath(target.installedSkillDirectoryPath),
            removePath(target.canonicalSkillDirectoryPath),
        ]);

        writeLine(
            context.stdout,
            context.translator.t("skills.uninstall.success", {
                name: skillName,
                path: target.installedSkillDirectoryPath,
            }),
        );
        context.logger.info(
            {
                agentName: target.agentName,
                canonicalPath: target.canonicalSkillDirectoryPath,
                path: target.installedSkillDirectoryPath,
                previousVersion: target.previousVersion ?? "unknown",
                skillName,
            },
            "Bundled skill removed explicitly.",
        );
    }
}

export async function uninstallRegistrySkill(
    skillName: string,
    context: CliExecutionContext,
    options?: {
        silent?: boolean;
    },
): Promise<ManagedSkillUninstallResult> {
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

    if (availableHosts.length === 0) {
        return createMissingManagedSkillUninstallResult(undefined, true);
    }

    const settingsFilePath = context.settingsStore.getFilePath();
    const hostInstallations = resolveManagedSkillHostInstallations(
        availableHosts,
        skillName,
    );

    if (hostInstallations.some(installation =>
        !isManagedSkillPathContained(
            installation.homeDirectory,
            settingsFilePath,
            skillName,
        ),
    )) {
        throw new CliUserError("errors.skills.invalidPath", 1, {
            name: skillName,
        });
    }

    const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillName,
    );
    const uninstallTargets = await resolveRegistrySkillUninstallTargets(
        hostInstallations,
    );
    const unmanagedInstallations = await resolveUnmanagedSkillUninstallInstallations({
        hostInstallations,
        managedTargetPaths: uninstallTargets.map(
            target => target.installedSkillDirectoryPath,
        ),
    });

    if (uninstallTargets.length === 0) {
        return {
            missingInstallationPath: hostInstallations[0]!.installedSkillDirectoryPath,
            noSupportedHosts: false,
            removed: false,
            unmanagedInstallations,
        };
    }

    await Promise.all([
        ...uninstallTargets.map(target =>
            removePath(target.installedSkillDirectoryPath),
        ),
        removePath(canonicalSkillDirectoryPath),
    ]);

    for (const target of uninstallTargets) {
        if (options?.silent !== true) {
            writeLine(
                context.stdout,
                context.translator.t("skills.uninstall.success", {
                    name: skillName,
                    path: target.installedSkillDirectoryPath,
                }),
            );
        }
        context.logger.info(
            {
                agentName: target.agentName,
                canonicalPath: canonicalSkillDirectoryPath,
                packageName: target.packageName,
                path: target.installedSkillDirectoryPath,
                previousVersion: target.previousVersion ?? "unknown",
                skillName,
            },
            "Managed registry skill removed explicitly.",
        );
    }

    return {
        missingInstallationPath: undefined,
        noSupportedHosts: false,
        removed: true,
        unmanagedInstallations,
    };
}

export async function uninstallLocalSkill(
    skillName: string,
    context: CliExecutionContext,
    options?: {
        silent?: boolean;
    },
): Promise<ManagedSkillUninstallResult> {
    const settingsFilePath = context.settingsStore.getFilePath();
    const localCanonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillName,
    );

    if (!isPathWithinDirectory(
        resolveLocalSkillCanonicalRootDirectoryPath(settingsFilePath),
        localCanonicalSkillDirectoryPath,
    )) {
        throw new CliUserError("errors.skills.invalidPath", 1, {
            name: skillName,
        });
    }

    const localCanonicalDirectoryExists = await directoryExists(
        localCanonicalSkillDirectoryPath,
    );
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

    if (availableHosts.length === 0) {
        if (!localCanonicalDirectoryExists) {
            return createMissingManagedSkillUninstallResult(undefined, true);
        }

        await removeLocalCanonicalSkillOnly({
            context,
            localCanonicalSkillDirectoryPath,
            silent: options?.silent === true,
            skillName,
        });
        return createRemovedManagedSkillUninstallResult();
    }

    const hostInstallations = resolveManagedSkillHostInstallations(
        availableHosts,
        skillName,
    );

    if (hostInstallations.some(installation =>
        !isLocalSkillPathContained(
            installation.homeDirectory,
            settingsFilePath,
            skillName,
        ),
    )) {
        throw new CliUserError("errors.skills.invalidPath", 1, {
            name: skillName,
        });
    }

    const uninstallTargets = await resolveLocalSkillUninstallTargets({
        canonicalDirectoryExists: localCanonicalDirectoryExists,
        canonicalSkillDirectoryPath: localCanonicalSkillDirectoryPath,
        hostInstallations,
    });
    const unmanagedInstallations = await resolveUnmanagedSkillUninstallInstallations({
        hostInstallations,
        managedTargetPaths: uninstallTargets.map(
            target => target.installedSkillDirectoryPath,
        ),
    });

    if (unmanagedInstallations.length > 0) {
        return {
            missingInstallationPath: undefined,
            noSupportedHosts: false,
            removed: false,
            unmanagedInstallations,
        };
    }

    if (!localCanonicalDirectoryExists && uninstallTargets.length === 0) {
        return createMissingManagedSkillUninstallResult(
            hostInstallations[0]!.installedSkillDirectoryPath,
            false,
        );
    }

    await Promise.all([
        ...uninstallTargets.map(target => removePath(target.installedSkillDirectoryPath)),
        removePath(localCanonicalSkillDirectoryPath),
    ]);

    if (uninstallTargets.length === 0) {
        writeLocalCanonicalSkillRemovalResult({
            context,
            localCanonicalSkillDirectoryPath,
            silent: options?.silent === true,
            skillName,
        });
        return createRemovedManagedSkillUninstallResult();
    }

    for (const target of uninstallTargets) {
        if (options?.silent !== true) {
            writeLine(
                context.stdout,
                context.translator.t("skills.uninstall.success", {
                    name: skillName,
                    path: target.installedSkillDirectoryPath,
                }),
            );
        }

        context.logger.info(
            {
                agentName: target.agentName,
                canonicalPath: localCanonicalSkillDirectoryPath,
                path: target.installedSkillDirectoryPath,
                skillName,
            },
            "Local skill removed explicitly.",
        );
    }

    return createRemovedManagedSkillUninstallResult();
}

export function createManagedSkillUninstallResultError(options: {
    context: Pick<CliExecutionContext, "env" | "logger">;
    logMessage: string;
    result: ManagedSkillUninstallResult;
    skillName: string;
}): CliUserError {
    const unmanagedInstallation = options.result.unmanagedInstallations[0];

    if (unmanagedInstallation !== undefined) {
        options.context.logger.warn(
            {
                agentName: unmanagedInstallation.agentName,
                path: unmanagedInstallation.installedSkillDirectoryPath,
                skillName: options.skillName,
            },
            options.logMessage,
        );
        return createManagedSkillUninstallError({
            installedDirectoryExists: true,
            path: unmanagedInstallation.installedSkillDirectoryPath,
            skillName: options.skillName,
        });
    }

    if (options.result.noSupportedHosts) {
        return createMissingManagedSkillHostError(options.context.env);
    }

    return createManagedSkillUninstallError({
        installedDirectoryExists: false,
        path: options.result.missingInstallationPath ?? options.skillName,
        skillName: options.skillName,
    });
}

async function resolveRegistrySkillUninstallTargets(
    hostInstallations: readonly ManagedSkillHostInstallation[],
): Promise<RegistrySkillUninstallTarget[]> {
    const targets: RegistrySkillUninstallTarget[] = [];

    for (const installation of hostInstallations) {
        if (!(await directoryExists(installation.installedSkillDirectoryPath))) {
            continue;
        }

        const metadata = await readManagedSkillMetadata(
            installation.installedSkillDirectoryPath,
        );

        if (metadata === undefined) {
            continue;
        }

        targets.push({
            ...installation,
            packageName: metadata.packageName,
            previousVersion: metadata.version,
        });
    }

    return targets;
}

async function resolveLocalSkillUninstallTargets(options: {
    hostInstallations: readonly ManagedSkillHostInstallation[];
    canonicalDirectoryExists: boolean;
    canonicalSkillDirectoryPath: string;
}): Promise<ManagedSkillHostInstallation[]> {
    const targets: ManagedSkillHostInstallation[] = [];

    if (!options.canonicalDirectoryExists) {
        return targets;
    }

    const localSkillFileContent = await readSkillFileContent(
        options.canonicalSkillDirectoryPath,
    );

    for (const installation of options.hostInstallations) {
        const installedSkillDirectoryExists = await directoryExists(
            installation.installedSkillDirectoryPath,
        );

        if (!installedSkillDirectoryExists) {
            continue;
        }

        if (
            localSkillFileContent !== undefined
            && await hasMatchingSkillFileContent({
                expectedContent: localSkillFileContent,
                skillDirectoryPath: installation.installedSkillDirectoryPath,
            })
        ) {
            targets.push(installation);
        }
    }

    return targets;
}

async function resolveUnmanagedSkillUninstallInstallations(options: {
    hostInstallations: readonly ManagedSkillHostInstallation[];
    managedTargetPaths: readonly string[];
}): Promise<ManagedSkillHostInstallation[]> {
    const targetPaths = new Set(options.managedTargetPaths);
    const unmanagedInstallations: ManagedSkillHostInstallation[] = [];

    for (const installation of options.hostInstallations) {
        if (
            targetPaths.has(installation.installedSkillDirectoryPath)
            || !(await directoryExists(installation.installedSkillDirectoryPath))
        ) {
            continue;
        }

        unmanagedInstallations.push(installation);
    }

    return unmanagedInstallations;
}

async function removeLocalCanonicalSkillOnly(options: {
    context: Pick<CliExecutionContext, "logger" | "stdout" | "translator">;
    localCanonicalSkillDirectoryPath: string;
    silent: boolean;
    skillName: string;
}): Promise<void> {
    await removePath(options.localCanonicalSkillDirectoryPath);
    writeLocalCanonicalSkillRemovalResult(options);
}

function writeLocalCanonicalSkillRemovalResult(options: {
    context: Pick<CliExecutionContext, "logger" | "stdout" | "translator">;
    localCanonicalSkillDirectoryPath: string;
    silent: boolean;
    skillName: string;
}): void {
    if (!options.silent) {
        writeLine(
            options.context.stdout,
            options.context.translator.t("skills.uninstall.success", {
                name: options.skillName,
                path: options.localCanonicalSkillDirectoryPath,
            }),
        );
    }

    options.context.logger.info(
        {
            canonicalPath: options.localCanonicalSkillDirectoryPath,
            skillName: options.skillName,
        },
        "Local skill removed explicitly.",
    );
}

function createMissingManagedSkillUninstallResult(
    missingInstallationPath: string | undefined,
    noSupportedHosts: boolean,
): ManagedSkillUninstallResult {
    return {
        missingInstallationPath,
        noSupportedHosts,
        removed: false,
        unmanagedInstallations: [],
    };
}

function createRemovedManagedSkillUninstallResult(): ManagedSkillUninstallResult {
    return {
        missingInstallationPath: undefined,
        noSupportedHosts: false,
        removed: true,
        unmanagedInstallations: [],
    };
}

function createManagedSkillUninstallError(options: {
    installedDirectoryExists: boolean;
    path: string;
    skillName: string;
}): CliUserError {
    return new CliUserError(
        options.installedDirectoryExists
            ? "errors.skills.notManaged"
            : "errors.skills.notInstalled",
        1,
        {
            name: options.skillName,
            path: options.path,
        },
    );
}
