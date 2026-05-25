import type { CliExecutionContext } from "../../contracts/cli.ts";

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
    readBundledSkillFileContent,
} from "./embedded-assets.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallation,
} from "./managed-skill-hosts.ts";

export interface BundledSkillHostInstallation extends ManagedSkillHostInstallation {
    canonicalSkillDirectoryPath: string;
}

export async function installBundledSkill(
    skillName: BundledSkillName,
    context: CliExecutionContext,
    options: { force?: boolean } = {},
): Promise<ManagedSkillInstallSummary> {
    const force = options.force === true;
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
            force,
        );
    }

    const publications: ManagedSkillInstallPublication[] = [];

    for (const installation of installations) {
        const installedSkillDirectoryPath = await publishManagedBundledSkill({
            agentName: installation.agentName,
            homeDirectory: installation.homeDirectory,
            settingsFilePath: context.settingsStore.getFilePath(),
            skillName,
            version: context.version,
        });

        publications.push({
            agentName: installation.agentName,
            path: installedSkillDirectoryPath,
        });
        context.logger.info(
            {
                agentName: installation.agentName,
                canonicalPath: installation.canonicalSkillDirectoryPath,
                path: installedSkillDirectoryPath,
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
}): Promise<string> {
    const installationPaths = await writeBundledSkillCanonicalInstallation(options);

    await publishBundledSkillInstallation(installationPaths);

    return installationPaths.installedSkillDirectoryPath;
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
        await Bun.write(destinationPath, await readBundledSkillFileContent(file));
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
    force: boolean,
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
            reportUnmanagedBundledSkillConflict(context.logger, {
                agentName: installation.agentName,
                blockedMessage: "Bundled skill install was blocked by an unmanaged directory.",
                errorKey: "errors.skills.nameConflict",
                force,
                forcedMessage: "Forcefully overwriting unmanaged skill directory because --force was set.",
                path: installation.installedSkillDirectoryPath,
                skillName,
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

    reportUnmanagedBundledSkillConflict(context.logger, {
        agentName: installation.agentName,
        blockedMessage: "Bundled skill install was blocked by an unmanaged canonical directory.",
        errorKey: "errors.skills.storageConflict",
        force,
        forcedMessage: "Forcefully overwriting unmanaged bundled skill canonical storage because --force was set.",
        path: installation.canonicalSkillDirectoryPath,
        skillName,
    });
}

function reportUnmanagedBundledSkillConflict(
    logger: Pick<CliExecutionContext["logger"], "warn">,
    options: {
        agentName: BundledSkillAgentName;
        blockedMessage: string;
        errorKey: string;
        force: boolean;
        forcedMessage: string;
        path: string;
        skillName: BundledSkillName;
    },
): void {
    const logFields = {
        agentName: options.agentName,
        path: options.path,
        skillName: options.skillName,
    };

    if (options.force) {
        logger.warn(logFields, options.forcedMessage);
        return;
    }

    logger.warn(logFields, options.blockedMessage);
    throw new CliUserError(options.errorKey, 1, {
        name: options.skillName,
        path: options.path,
    });
}
