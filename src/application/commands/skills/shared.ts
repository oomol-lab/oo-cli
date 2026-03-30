import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AppSettings } from "../../schemas/settings.ts";

import type { BundledSkillPublicationResult } from "./bundled-skill-filesystem.ts";
import type { BundledSkillName } from "./embedded-assets.ts";
import {
    mkdir,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import { defaultSettings } from "../../schemas/settings.ts";
import {
    publishBundledSkillInstallation,
    removePath,
} from "./bundled-skill-filesystem.ts";
import {
    canUninstallManagedBundledSkillInstallation,
    renderBundledSkillFileContent,
    resolveBundledSkillImplicitInvocation,
    resolveBundledSkillInstallConflict,
    resolveBundledSkillManagedSynchronizationAction,
    resolveBundledSkillMissingInstallationAction,
} from "./bundled-skill-model.ts";
import {
    directoryExists,
    fileExists,
    isBundledSkillInstallationCurrent,
    isManagedBundledSkillInstallation,
    readInstalledBundledSkillImplicitInvocation,
    readInstalledBundledSkillVersion,
    requireCodexHomeDirectory,
    writeInstalledBundledSkillMetadata,
} from "./bundled-skill-observation.ts";
import {
    resolveBundledSkillCanonicalDirectoryPath,
    resolveBundledSkillDirectoryPath,
    resolveBundledSkillMetadataFilePath,
    resolveCodexHomeDirectory,
} from "./bundled-skill-paths.ts";
import {
    availableBundledSkillNames,
    getBundledSkillFiles,
} from "./embedded-assets.ts";
import { readManagedSkillMetadata } from "./managed-skill-metadata.ts";
import {
    isManagedSkillPathContained,
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";

export {
    createBundledSkillDirectorySymlink,
    publishBundledSkillInstallation,
    removeBundledSkillSymbolicPath,
} from "./bundled-skill-filesystem.ts";
export type {
    BundledSkillPublicationResult,
    CreateBundledSkillDirectorySymlinkDependencies,
    RemoveBundledSkillSymbolicPathDependencies,
} from "./bundled-skill-filesystem.ts";
export {
    resolveBundledSkillCanonicalDirectoryPath,
    resolveBundledSkillDirectoryPath,
    resolveBundledSkillMetadataFilePath,
    resolveCodexHomeDirectory,
} from "./bundled-skill-paths.ts";

export async function installBundledSkill(
    skillName: BundledSkillName,
    context: CliExecutionContext,
): Promise<void> {
    const codexHomeDirectory = await requireCodexHomeDirectory(context);
    const settings = await context.settingsStore.read();
    const settingsFilePath = context.settingsStore.getFilePath();
    const installedSkillDirectoryPath = resolveBundledSkillDirectoryPath(
        codexHomeDirectory,
        skillName,
    );
    const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillName,
    );

    const installedSkillDirectoryExists = await directoryExists(
        installedSkillDirectoryPath,
    );

    if (installedSkillDirectoryExists) {
        const installedSkillDirectoryManaged
            = await isManagedBundledSkillInstallation(installedSkillDirectoryPath);

        if (resolveBundledSkillInstallConflict({
            canonicalDirectoryExists: false,
            canonicalDirectoryManaged: false,
            installedDirectoryExists: true,
            installedDirectoryManaged: installedSkillDirectoryManaged,
        }) === "nameConflict") {
            context.logger.warn(
                {
                    path: installedSkillDirectoryPath,
                    skillName,
                },
                "Bundled Codex skill install was blocked by an unmanaged directory.",
            );
            throw new CliUserError("errors.skills.nameConflict", 1, {
                name: skillName,
                path: installedSkillDirectoryPath,
            });
        }
    }

    const canonicalSkillDirectoryExists = await directoryExists(
        canonicalSkillDirectoryPath,
    );

    if (canonicalSkillDirectoryExists) {
        const canonicalSkillDirectoryManaged
            = await isManagedBundledSkillInstallation(canonicalSkillDirectoryPath);

        if (resolveBundledSkillInstallConflict({
            canonicalDirectoryExists: true,
            canonicalDirectoryManaged: canonicalSkillDirectoryManaged,
            installedDirectoryExists: false,
            installedDirectoryManaged: false,
        }) === "storageConflict") {
            context.logger.warn(
                {
                    path: canonicalSkillDirectoryPath,
                    skillName,
                },
                "Bundled Codex skill install was blocked by an unmanaged canonical directory.",
            );
            throw new CliUserError("errors.skills.storageConflict", 1, {
                name: skillName,
                path: canonicalSkillDirectoryPath,
            });
        }
    }

    const installation = await writeBundledSkillInstallation({
        codexHomeDirectory,
        settings,
        settingsFilePath,
        skillName,
        version: context.version,
    });

    writeLine(
        context,
        context.translator.t("skills.install.success", {
            name: skillName,
            path: installation.path,
        }),
    );
    context.logger.info(
        {
            canonicalPath: canonicalSkillDirectoryPath,
            installMode: installation.mode,
            path: installation.path,
            skillName,
            version: context.version,
        },
        "Bundled Codex skill installed explicitly.",
    );
}

export async function maybeSynchronizeInstalledBundledSkills(
    context: Pick<CliExecutionContext, "env" | "logger" | "settingsStore" | "version">,
    options: {
        installMissing?: boolean;
        settings?: AppSettings;
    } = {},
): Promise<void> {
    const codexHomeDirectory = resolveCodexHomeDirectory(context.env);
    const settings = options.settings ?? defaultSettings;
    const settingsFilePath = context.settingsStore.getFilePath();

    if (!(await directoryExists(codexHomeDirectory))) {
        context.logger.debug(
            {
                path: codexHomeDirectory,
            },
            "Bundled Codex skill synchronization skipped because Codex home is missing.",
        );
        return;
    }

    for (const skillName of availableBundledSkillNames) {
        const skillDirectoryPath = resolveBundledSkillDirectoryPath(
            codexHomeDirectory,
            skillName,
        );
        const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
            settingsFilePath,
            skillName,
        );

        try {
            const installedSkillDirectoryExists = await directoryExists(
                skillDirectoryPath,
            );

            if (!installedSkillDirectoryExists) {
                if (
                    resolveBundledSkillMissingInstallationAction(
                        options.installMissing === true,
                    ) === "skip-missing"
                ) {
                    context.logger.debug(
                        {
                            path: skillDirectoryPath,
                            skillName,
                            version: context.version,
                        },
                        "Bundled Codex skill synchronization skipped because the managed skill is not installed.",
                    );
                    continue;
                }

                const installation = await writeBundledSkillInstallation({
                    codexHomeDirectory,
                    settings,
                    settingsFilePath,
                    skillName,
                    version: context.version,
                });
                context.logger.info(
                    {
                        canonicalPath: canonicalSkillDirectoryPath,
                        installMode: installation.mode,
                        path: installation.path,
                        skillName,
                        version: context.version,
                    },
                    "Bundled Codex skill installed during first-run bootstrap.",
                );
                continue;
            }

            const managedInstallation = await isManagedBundledSkillInstallation(
                skillDirectoryPath,
            );

            if (!managedInstallation) {
                context.logger.debug(
                    {
                        path: skillDirectoryPath,
                        skillName,
                    },
                    "Bundled Codex skill synchronization skipped because the existing directory is not managed by OOMOL.",
                );
                continue;
            }

            const isCurrentInstallation = await isBundledSkillInstallationCurrent(
                skillName,
                skillDirectoryPath,
                context.version,
            );
            const desiredImplicitInvocation = resolveBundledSkillImplicitInvocation(
                skillName,
                settings,
            );
            const installedImplicitInvocation = isCurrentInstallation
                ? await readInstalledBundledSkillImplicitInvocation(
                        skillDirectoryPath,
                    )
                : undefined;
            const managedSynchronizationAction
                = resolveBundledSkillManagedSynchronizationAction({
                    desiredImplicitInvocation,
                    installedImplicitInvocation,
                    isCurrentInstallation,
                });

            if (managedSynchronizationAction === "sync-installation") {
                const previousVersion
                    = await readInstalledBundledSkillVersion(skillDirectoryPath);
                const installation = await writeBundledSkillInstallation({
                    codexHomeDirectory,
                    settings,
                    settingsFilePath,
                    skillName,
                    version: context.version,
                });

                context.logger.info(
                    {
                        canonicalPath: canonicalSkillDirectoryPath,
                        installMode: installation.mode,
                        path: installation.path,
                        previousVersion: previousVersion ?? "unknown",
                        skillName,
                        version: context.version,
                    },
                    "Bundled Codex skill synchronized.",
                );
                continue;
            }

            if (managedSynchronizationAction === "skip-current") {
                context.logger.debug(
                    {
                        path: skillDirectoryPath,
                        skillName,
                        version: context.version,
                    },
                    "Bundled Codex skill synchronization skipped because the managed skill is already current.",
                );
                continue;
            }

            const installation = await writeBundledSkillInstallation({
                codexHomeDirectory,
                settings,
                settingsFilePath,
                skillName,
                version: context.version,
            });
            context.logger.info(
                {
                    canonicalPath: canonicalSkillDirectoryPath,
                    implicitInvocation: desiredImplicitInvocation,
                    installMode: installation.mode,
                    path: installation.path,
                    skillName,
                    version: context.version,
                },
                "Bundled Codex skill policy synchronized.",
            );
        }
        catch (error) {
            context.logger.warn(
                {
                    err: error,
                    path: skillDirectoryPath,
                    skillName,
                    version: context.version,
                },
                "Failed to synchronize bundled Codex skill.",
            );
        }
    }
}

export async function uninstallBundledSkill(
    skillName: BundledSkillName,
    context: CliExecutionContext,
): Promise<void> {
    const codexHomeDirectory = await requireCodexHomeDirectory(context);
    const skillDirectoryPath = resolveBundledSkillDirectoryPath(
        codexHomeDirectory,
        skillName,
    );
    const canonicalSkillDirectoryPath = resolveBundledSkillCanonicalDirectoryPath(
        context.settingsStore.getFilePath(),
        skillName,
    );
    const installedSkillDirectoryExists = await directoryExists(skillDirectoryPath);
    const installedSkillMetadataExists = installedSkillDirectoryExists
        ? await fileExists(resolveBundledSkillMetadataFilePath(skillDirectoryPath))
        : false;

    if (!canUninstallManagedBundledSkillInstallation({
        installedDirectoryExists: installedSkillDirectoryExists,
        installedDirectoryManaged: installedSkillMetadataExists,
    })) {
        context.logger.warn(
            {
                path: skillDirectoryPath,
                skillName,
            },
            "Bundled Codex skill uninstall skipped because no managed installation was found.",
        );
        throw createManagedSkillUninstallError({
            installedDirectoryExists: installedSkillDirectoryExists,
            path: skillDirectoryPath,
            skillName,
        });
    }

    const previousVersion = await readInstalledBundledSkillVersion(skillDirectoryPath);

    await removePath(skillDirectoryPath);
    await removePath(canonicalSkillDirectoryPath);

    writeLine(
        context,
        context.translator.t("skills.uninstall.success", {
            name: skillName,
            path: skillDirectoryPath,
        }),
    );
    context.logger.info(
        {
            canonicalPath: canonicalSkillDirectoryPath,
            path: skillDirectoryPath,
            previousVersion: previousVersion ?? "unknown",
            skillName,
        },
        "Bundled Codex skill removed explicitly.",
    );
}

export async function uninstallManagedSkill(
    skillName: string,
    context: CliExecutionContext,
): Promise<void> {
    if (isBundledSkillName(skillName)) {
        await uninstallBundledSkill(skillName, context);
        return;
    }

    await uninstallRegistrySkill(skillName, context);
}

async function writeBundledSkillInstallation(options: {
    codexHomeDirectory: string;
    settings: AppSettings;
    settingsFilePath: string;
    skillName: BundledSkillName;
    version: string;
}): Promise<BundledSkillPublicationResult> {
    const installationPaths = await writeBundledSkillCanonicalInstallation(options);

    return publishBundledSkillInstallation(installationPaths);
}

export async function writeBundledSkillCanonicalInstallation(options: {
    codexHomeDirectory: string;
    settings: AppSettings;
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
    );
    const installedSkillDirectoryPath = resolveBundledSkillDirectoryPath(
        options.codexHomeDirectory,
        options.skillName,
    );

    await removePath(canonicalSkillDirectoryPath);
    await mkdir(canonicalSkillDirectoryPath, { recursive: true });

    for (const file of getBundledSkillFiles(options.skillName)) {
        const destinationPath = join(
            canonicalSkillDirectoryPath,
            file.relativePath,
        );

        await mkdir(dirname(destinationPath), { recursive: true });
        await Bun.write(
            destinationPath,
            await renderBundledSkillFileContent(
                options.skillName,
                file.relativePath,
                await Bun.file(file.sourcePath).text(),
                options.settings,
            ),
        );
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

function writeLine(context: CliExecutionContext, message: string): void {
    context.stdout.write(`${message}\n`);
}

async function uninstallRegistrySkill(
    skillName: string,
    context: CliExecutionContext,
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
    const installedSkillDirectoryExists = await directoryExists(skillDirectoryPath);
    const installedSkillMetadataExists = installedSkillDirectoryExists
        ? await fileExists(resolveManagedSkillMetadataFilePath(skillDirectoryPath))
        : false;

    if (
        !canUninstallManagedBundledSkillInstallation({
            installedDirectoryExists: installedSkillDirectoryExists,
            installedDirectoryManaged: installedSkillMetadataExists,
        })
    ) {
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

    const metadata = await readManagedSkillMetadata(skillDirectoryPath);

    await removePath(skillDirectoryPath);
    await removePath(canonicalSkillDirectoryPath);

    writeLine(
        context,
        context.translator.t("skills.uninstall.success", {
            name: skillName,
            path: skillDirectoryPath,
        }),
    );
    context.logger.info(
        {
            canonicalPath: canonicalSkillDirectoryPath,
            packageName: metadata?.packageName,
            path: skillDirectoryPath,
            previousVersion: metadata?.version ?? "unknown",
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

function isBundledSkillName(value: string): value is BundledSkillName {
    return availableBundledSkillNames.includes(value as BundledSkillName);
}
