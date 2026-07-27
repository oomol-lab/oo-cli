import type { CliExecutionContext } from "../../contracts/cli.ts";

import type {
    BundledSkillAgentName,
    BundledSkillName,
} from "./embedded-assets.ts";
import type { LocalSkillSource } from "./local-skill-source.ts";
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
    installedRegistrySkillNamesForPackage,
    readInstalledSkills,
} from "./installed-skills.ts";
import { readLocalSkillMetadata } from "./local-skill-ownership.ts";
import {
    findLocalSkillSources,
} from "./local-skill-source.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import { readManagedSkillMetadata } from "./managed-skill-metadata.ts";
import {
    isManagedSkillPathContained,
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    isBundledSkillName,
    isScopedPackageName,
    resolveAvailableBundledSkillHostInstallations,
} from "./shared.ts";

interface RegistrySkillUninstallTarget extends ManagedSkillHostInstallation {
    packageName: string | undefined;
    previousVersion: string | undefined;
}

export interface ManagedSkillUninstallResult {
    ambiguousAgents?: string;
    missingInstallationPath: string | undefined;
    noSupportedHosts: boolean;
    removed: boolean;
    skipped: boolean;
    unmanagedInstallations: readonly ManagedSkillHostInstallation[];
}

export async function uninstallRequestedSkills(
    skillNames: readonly string[],
    context: CliExecutionContext,
    options: {
        agentName?: BundledSkillAgentName;
    } = {},
): Promise<void> {
    if (skillNames.length === 0) {
        for (const bundledSkillName of availableBundledSkillNames) {
            await uninstallBundledSkill(bundledSkillName, context);
        }
        return;
    }

    // Names are processed in order; the first failure propagates and stops the
    // run, mirroring `oo skills install`. The `--json` path is best-effort and
    // aggregates per-name outcomes instead.
    for (const skillName of skillNames) {
        await uninstallRequestedSkillName(skillName, context, options);
    }
}

async function uninstallRequestedSkillName(
    skillName: string,
    context: CliExecutionContext,
    options: {
        agentName?: BundledSkillAgentName;
    },
): Promise<void> {
    if (isScopedPackageName(skillName)) {
        await uninstallPackageSkills(skillName, context);
        return;
    }

    if (isBundledSkillName(skillName)) {
        await uninstallBundledSkill(skillName, context);
        return;
    }

    const registryResult = await uninstallRegistrySkill(skillName, context);
    const localResult = await uninstallLocalSkill(skillName, context, {
        agentName: options.agentName,
    });

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

    if (localResult.skipped) {
        throw new CliUserError("warnings.skills.localUninstallAmbiguous", 1, {
            agents: localResult.ambiguousAgents ?? "",
            name: skillName,
        });
    }

    // An existing same-name directory that oo does not manage is a conflict to
    // surface, not a reason to reinterpret the argument as a package.
    if (registryResult.unmanagedInstallations.length > 0) {
        throw createManagedSkillUninstallResultError({
            context,
            logMessage:
                "Managed registry skill uninstall skipped because no OOMOL metadata was found.",
            result: registryResult,
            skillName,
        });
    }

    // No skill is installed under this name; treat it as a package and remove
    // every installed skill that belongs to it.
    await uninstallPackageSkills(skillName, context);
}

async function uninstallPackageSkills(
    packageName: string,
    context: CliExecutionContext,
): Promise<void> {
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

    if (availableHosts.length === 0) {
        throw createMissingManagedSkillHostError(context.env);
    }

    const skillNames = installedRegistrySkillNamesForPackage(
        await readInstalledSkills(context.env, context.settingsStore.getFilePath()),
        packageName,
    );

    if (skillNames.length === 0) {
        throw new CliUserError("errors.skills.uninstall.packageNotInstalled", 1, {
            name: packageName,
        });
    }

    for (const skillName of skillNames) {
        const result = await uninstallRegistrySkill(skillName, context);

        // The skill name came from this package's recorded metadata, so a
        // non-removal means the installation could not actually be cleaned up
        // (e.g. a canonical-only or unmanaged remnant). Surface it instead of
        // reporting success.
        if (!result.removed) {
            throw createManagedSkillUninstallResultError({
                context,
                logMessage:
                    "Package skill uninstall skipped because the target could not be removed.",
                result,
                skillName,
            });
        }
    }
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
            skipped: false,
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
        skipped: false,
        unmanagedInstallations,
    };
}

export async function uninstallLocalSkill(
    skillName: string,
    context: CliExecutionContext,
    options?: {
        agentName?: BundledSkillAgentName;
        silent?: boolean;
    },
): Promise<ManagedSkillUninstallResult> {
    const result = await uninstallLocalSkillFromSources(skillName, context, {
        agentName: options?.agentName,
        silent: options?.silent === true,
    });

    return result ?? createMissingManagedSkillUninstallResult(skillName, false);
}

async function uninstallLocalSkillFromSources(
    skillName: string,
    context: CliExecutionContext,
    options: {
        agentName?: BundledSkillAgentName;
        silent: boolean;
    },
): Promise<ManagedSkillUninstallResult | undefined> {
    const sources = await findLocalSkillSources({
        agentName: options.agentName,
        context: {
            env: context.env,
        },
        skillName,
    });

    if (sources.length === 0) {
        return undefined;
    }

    if (options.agentName === undefined && sources.length > 1) {
        const ambiguousAgents = renderLocalSkillSourceAgents(sources);
        context.logger.warn(
            {
                sourceCount: sources.length,
                skillName,
            },
            "Local skill uninstall skipped because multiple local sources matched.",
        );
        return {
            ambiguousAgents,
            missingInstallationPath: undefined,
            noSupportedHosts: false,
            removed: false,
            skipped: true,
            unmanagedInstallations: [],
        };
    }

    const source = sources[0]!;

    if (await readLocalSkillMetadata(source.path) === undefined) {
        return undefined;
    }

    await removePath(source.path);

    if (!options.silent) {
        writeLine(
            context.stdout,
            context.translator.t("skills.uninstall.success", {
                name: skillName,
                path: source.path,
            }),
        );
    }

    context.logger.info(
        {
            agentName: source.agentName,
            path: source.path,
            skillName,
        },
        "Local skill removed explicitly.",
    );

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

function renderLocalSkillSourceAgents(
    sources: readonly LocalSkillSource[],
): string {
    return sources
        .map(source => source.agentName)
        .join(", ");
}

function createMissingManagedSkillUninstallResult(
    missingInstallationPath: string | undefined,
    noSupportedHosts: boolean,
): ManagedSkillUninstallResult {
    return {
        missingInstallationPath,
        noSupportedHosts,
        removed: false,
        skipped: false,
        unmanagedInstallations: [],
    };
}

function createRemovedManagedSkillUninstallResult(): ManagedSkillUninstallResult {
    return {
        missingInstallationPath: undefined,
        noSupportedHosts: false,
        removed: true,
        skipped: false,
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
