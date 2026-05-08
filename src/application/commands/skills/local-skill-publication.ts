import type { CliExecutionContext } from "../../contracts/cli.ts";
import type {
    ManagedSkillInstallPublication,
    ManagedSkillInstallSummary,
} from "./install-output.ts";
import type {
    ManagedSkillHost,
    ManagedSkillHostInstallation,
} from "./managed-skill-hosts.ts";

import { readdir } from "node:fs/promises";
import { CliUserError } from "../../contracts/cli.ts";
import { writeLine } from "../shared/output.ts";
import {
    isNodeNotFoundError,
    publishBundledSkillInstallation,
} from "./bundled-skill-filesystem.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
import {
    hasMatchingSkillFileHash,
    isForeignManagedMetadataState,
    readSkillFileHash,
    readSkillMetadataFileState,
    writeLocalSkillMetadata,
} from "./local-skill-ownership.ts";
import {
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import {
    isLocalSkillPathContained,
    resolveLocalSkillCanonicalDirectoryPath,
    resolveLocalSkillCanonicalRootDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    isManagedSkillPublicationCurrent,
} from "./managed-skill-publication.ts";

export interface DriftedLocalSkillCopy {
    agentName: ManagedSkillHostInstallation["agentName"];
    path: string;
}

type LocalSkillPublicationContext = Pick<
    CliExecutionContext,
    "env" | "logger" | "settingsStore" | "stderr" | "translator"
>;

export async function publishCanonicalLocalSkillsToAvailableHosts(
    context: LocalSkillPublicationContext,
): Promise<ManagedSkillInstallSummary[]> {
    const hosts = await resolveAvailableManagedSkillHosts(context.env);

    if (hosts.length === 0) {
        return [];
    }

    const settingsFilePath = context.settingsStore.getFilePath();
    const skillNames = await listCanonicalLocalSkillNames(settingsFilePath);

    return (
        await Promise.all(skillNames.map(skillName =>
            publishCanonicalLocalSkillToHosts({
                context,
                hosts,
                settingsFilePath,
                skillName,
            }),
        ))
    ).filter(summary => summary.publications.length > 0);
}

export async function findDriftedLocalSkillCopies(options: {
    context: Pick<CliExecutionContext, "env" | "settingsStore">;
    skillName: string;
}): Promise<DriftedLocalSkillCopy[]> {
    const hosts = await resolveAvailableManagedSkillHosts(options.context.env);
    const settingsFilePath = options.context.settingsStore.getFilePath();
    const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
        settingsFilePath,
        options.skillName,
    );
    const canonicalHash = await readSkillFileHash(canonicalSkillDirectoryPath);

    if (canonicalHash === undefined) {
        return [];
    }

    const hostInstallations = resolveManagedSkillHostInstallations(
        hosts,
        options.skillName,
    );
    const driftedCopies = await Promise.all(
        hostInstallations.map(async (installation) => {
            const metadata = (await readSkillMetadataFileState(
                installation.installedSkillDirectoryPath,
            )).metadata;

            if (metadata?.kind !== "local") {
                return undefined;
            }

            if (
                await hasMatchingSkillFileHash({
                    expectedHash: canonicalHash,
                    skillDirectoryPath: installation.installedSkillDirectoryPath,
                })
            ) {
                return undefined;
            }

            return {
                agentName: installation.agentName,
                path: installation.installedSkillDirectoryPath,
            } satisfies DriftedLocalSkillCopy;
        }),
    );

    return driftedCopies.filter(copy => copy !== undefined);
}

export async function publishCanonicalLocalSkillToHosts(options: {
    context: LocalSkillPublicationContext;
    hosts: readonly ManagedSkillHost[];
    settingsFilePath: string;
    skillName: string;
}): Promise<ManagedSkillInstallSummary> {
    const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
        options.settingsFilePath,
        options.skillName,
    );
    const canonicalHash = await readSkillFileHash(canonicalSkillDirectoryPath);

    if (canonicalHash === undefined) {
        return {
            name: options.skillName,
            publications: [],
        };
    }

    await writeLocalSkillMetadata(canonicalSkillDirectoryPath);

    const publications = await Promise.all(
        resolveManagedSkillHostInstallations(options.hosts, options.skillName)
            .map(installation =>
                publishCanonicalLocalSkillToHost({
                    canonicalHash,
                    canonicalSkillDirectoryPath,
                    context: options.context,
                    installation,
                    settingsFilePath: options.settingsFilePath,
                    skillName: options.skillName,
                }),
            ),
    );

    return {
        name: options.skillName,
        publications: publications.filter(publication => publication !== undefined),
    };
}

async function publishCanonicalLocalSkillToHost(options: {
    canonicalHash: string;
    canonicalSkillDirectoryPath: string;
    context: LocalSkillPublicationContext;
    installation: ManagedSkillHostInstallation;
    settingsFilePath: string;
    skillName: string;
}): Promise<ManagedSkillInstallPublication | undefined> {
    if (
        !isLocalSkillPathContained(
            options.installation.homeDirectory,
            options.settingsFilePath,
            options.skillName,
        )
    ) {
        throw new CliUserError("errors.skills.invalidPath", 1, {
            name: options.skillName,
        });
    }

    const shouldPublish = await shouldPublishLocalSkillToTarget(options);

    if (!shouldPublish) {
        return undefined;
    }

    await publishBundledSkillInstallation({
        canonicalSkillDirectoryPath: options.canonicalSkillDirectoryPath,
        installedSkillDirectoryPath: options.installation.installedSkillDirectoryPath,
    });

    options.context.logger.info(
        {
            agentName: options.installation.agentName,
            canonicalPath: options.canonicalSkillDirectoryPath,
            path: options.installation.installedSkillDirectoryPath,
            skillName: options.skillName,
        },
        "Local skill published from canonical storage.",
    );

    return {
        agentName: options.installation.agentName,
        path: options.installation.installedSkillDirectoryPath,
    };
}

async function shouldPublishLocalSkillToTarget(options: {
    canonicalHash: string;
    context: LocalSkillPublicationContext;
    installation: ManagedSkillHostInstallation;
    skillName: string;
}): Promise<boolean> {
    if (!(await directoryExists(options.installation.installedSkillDirectoryPath))) {
        return true;
    }

    const metadataState = await readSkillMetadataFileState(
        options.installation.installedSkillDirectoryPath,
    );

    if (isForeignManagedMetadataState(metadataState)) {
        throw new CliUserError("errors.skills.nameConflict", 1, {
            name: options.skillName,
            path: options.installation.installedSkillDirectoryPath,
        });
    }

    const hasMatchingHash = await hasMatchingSkillFileHash({
        expectedHash: options.canonicalHash,
        skillDirectoryPath: options.installation.installedSkillDirectoryPath,
    });

    if (metadataState.metadata?.kind === "local") {
        if (!hasMatchingHash) {
            writeLocalSkillDriftWarning(options);
            return true;
        }

        return !(await isManagedSkillPublicationCurrent(
            options.installation.installedSkillDirectoryPath,
        ));
    }

    if (hasMatchingHash) {
        return true;
    }

    throw new CliUserError("errors.skills.nameConflict", 1, {
        name: options.skillName,
        path: options.installation.installedSkillDirectoryPath,
    });
}

function writeLocalSkillDriftWarning(options: {
    context: LocalSkillPublicationContext;
    installation: ManagedSkillHostInstallation;
    skillName: string;
}): void {
    options.context.logger.warn(
        {
            agentName: options.installation.agentName,
            path: options.installation.installedSkillDirectoryPath,
            skillName: options.skillName,
        },
        "Local skill copy differs from canonical storage and will be overwritten.",
    );

    writeLine(
        options.context.stderr,
        options.context.translator.t("warnings.skills.localCopyDriftOverwritten", {
            name: options.skillName,
            path: options.installation.installedSkillDirectoryPath,
        }),
    );
}

async function listCanonicalLocalSkillNames(
    settingsFilePath: string,
): Promise<string[]> {
    const rootDirectoryPath = resolveLocalSkillCanonicalRootDirectoryPath(
        settingsFilePath,
    );

    try {
        const entries = await readdir(rootDirectoryPath, { withFileTypes: true });

        return entries
            .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
            .map(entry => entry.name)
            .sort();
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return [];
        }

        throw error;
    }
}
