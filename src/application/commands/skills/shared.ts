import type { CliExecutionContext } from "../../contracts/cli.ts";

import type { BundledSkillPublicationResult } from "./bundled-skill-filesystem.ts";
import type {
    BundledSkillAgentName,
    BundledSkillName,
} from "./embedded-assets.ts";
import {
    mkdir,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import { writeLine } from "../shared/output.ts";
import {
    publishBundledSkillInstallation,
    removePath,
} from "./bundled-skill-filesystem.ts";
import {
    canUninstallManagedBundledSkillInstallation,
    resolveBundledSkillInstallConflict,
} from "./bundled-skill-model.ts";
import {
    directoryExists,
    isManagedBundledSkillInstallation,
    readInstalledBundledSkillMetadata,
    requireCodexHomeDirectory,
    writeInstalledBundledSkillMetadata,
} from "./bundled-skill-observation.ts";
import {
    resolveBundledSkillCanonicalDirectoryPath,
    resolveBundledSkillDirectoryPath,
    resolveBundledSkillHomeDirectory,
} from "./bundled-skill-paths.ts";
import {
    availableBundledSkillAgentNames,
    availableBundledSkillNames,
    getBundledSkillFiles,
} from "./embedded-assets.ts";
import { readManagedSkillMetadata } from "./managed-skill-metadata.ts";

import {
    isManagedSkillPathContained,
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
} from "./managed-skill-paths.ts";

interface BundledSkillHostInstallation {
    agentName: BundledSkillAgentName;
    canonicalSkillDirectoryPath: string;
    homeDirectory: string;
    installedSkillDirectoryPath: string;
}

export async function installBundledSkill(
    skillName: BundledSkillName,
    context: CliExecutionContext,
): Promise<void> {
    const installations = await resolveAvailableBundledSkillHostInstallations(
        context,
        skillName,
    );

    if (installations.length === 0) {
        throw createMissingBundledSkillHostError(context.env);
    }

    for (const installation of installations) {
        await validateBundledSkillInstallationTarget(
            skillName,
            installation,
            context,
        );
    }

    for (const installation of installations) {
        const publishedInstallation = await writeBundledSkillInstallation({
            agentName: installation.agentName,
            homeDirectory: installation.homeDirectory,
            settingsFilePath: context.settingsStore.getFilePath(),
            skillName,
            version: context.version,
        });

        writeLine(
            context.stdout,
            context.translator.t("skills.install.success", {
                name: skillName,
                path: publishedInstallation.path,
            }),
        );
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
        throw createMissingBundledSkillHostError(context.env);
    }

    const uninstallTargets: Array<
        BundledSkillHostInstallation & {
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

export async function uninstallManagedSkill(
    skillName: string,
    context: CliExecutionContext,
    options?: {
        silent?: boolean;
    },
): Promise<void> {
    if (isBundledSkillName(skillName)) {
        await uninstallBundledSkill(skillName, context);
        return;
    }

    await uninstallRegistrySkill(skillName, context, options);
}

async function writeBundledSkillInstallation(options: {
    agentName: BundledSkillAgentName;
    homeDirectory: string;
    settingsFilePath: string;
    skillName: BundledSkillName;
    version: string;
}): Promise<BundledSkillPublicationResult> {
    const installationPaths = await writeBundledSkillCanonicalInstallation(options);

    return publishBundledSkillInstallation(installationPaths);
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

async function resolveAvailableBundledSkillHostInstallations(
    context: Pick<CliExecutionContext, "env" | "settingsStore">,
    skillName: BundledSkillName,
): Promise<BundledSkillHostInstallation[]> {
    const settingsFilePath = context.settingsStore.getFilePath();
    const installations: BundledSkillHostInstallation[] = [];

    for (const agentName of availableBundledSkillAgentNames) {
        const homeDirectory = resolveBundledSkillHomeDirectory(
            context.env,
            agentName,
        );

        if (!(await directoryExists(homeDirectory))) {
            continue;
        }

        installations.push({
            agentName,
            canonicalSkillDirectoryPath: resolveBundledSkillCanonicalDirectoryPath(
                settingsFilePath,
                skillName,
                agentName,
            ),
            homeDirectory,
            installedSkillDirectoryPath: resolveBundledSkillDirectoryPath(
                homeDirectory,
                skillName,
            ),
        });
    }

    return installations;
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

function createMissingBundledSkillHostError(
    env: Record<string, string | undefined>,
): CliUserError {
    return new CliUserError("errors.skills.noSupportedBundledSkillHosts", 1, {
        paths: availableBundledSkillAgentNames
            .map(agentName => resolveBundledSkillHomeDirectory(env, agentName))
            .join(", "),
    });
}

async function uninstallRegistrySkill(
    skillName: string,
    context: CliExecutionContext,
    options?: {
        silent?: boolean;
    },
): Promise<void> {
    const codexHomeDirectory = await requireCodexHomeDirectory(context);
    const settingsFilePath = context.settingsStore.getFilePath();

    if (!isManagedSkillPathContained(
        codexHomeDirectory,
        settingsFilePath,
        skillName,
    )) {
        throw new CliUserError("errors.skills.invalidPath", 1, {
            name: skillName,
        });
    }

    const skillDirectoryPath = resolveManagedSkillDirectoryPath(
        codexHomeDirectory,
        skillName,
    );
    const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillName,
    );
    const metadata = await readManagedSkillMetadata(skillDirectoryPath);

    if (metadata === undefined) {
        const installedSkillDirectoryExists = await directoryExists(skillDirectoryPath);

        context.logger.warn(
            {
                path: skillDirectoryPath,
                skillName,
            },
            "Managed Codex skill uninstall skipped because no OOMOL metadata was found.",
        );
        throw createManagedSkillUninstallError({
            installedDirectoryExists: installedSkillDirectoryExists,
            path: skillDirectoryPath,
            skillName,
        });
    }

    await Promise.all([
        removePath(skillDirectoryPath),
        removePath(canonicalSkillDirectoryPath),
    ]);

    if (options?.silent !== true) {
        writeLine(
            context.stdout,
            context.translator.t("skills.uninstall.success", {
                name: skillName,
                path: skillDirectoryPath,
            }),
        );
    }
    context.logger.info(
        {
            canonicalPath: canonicalSkillDirectoryPath,
            packageName: metadata.packageName,
            path: skillDirectoryPath,
            previousVersion: metadata.version ?? "unknown",
            skillName,
        },
        "Managed Codex skill removed explicitly.",
    );
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

export function isBundledSkillName(value: string): value is BundledSkillName {
    return availableBundledSkillNames.includes(value as BundledSkillName);
}
