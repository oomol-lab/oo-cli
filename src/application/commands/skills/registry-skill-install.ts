import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type {
    ManagedSkillInstallPublication,
    ManagedSkillInstallSummary,
} from "./install-output.ts";
import type { ManagedSkillHost } from "./managed-skill-hosts.ts";
import type { RegistryPackageSkillInfo, RegistrySkillSummary } from "./registry-skill-source.ts";
import { requireIdentity } from "../../auth/identity.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { withPackageIdentity } from "../../logging/log-fields.ts";
import { writeLine } from "../shared/output.ts";
import { writeManagedSkillInstallSummary } from "./install-output.ts";
import {
    confirmInteractiveValue,
} from "./interactive-prompts.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import {
    isManagedSkillPathContained,
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import { extractRegistryPackageArchive } from "./registry-skill-archive.ts";
import {
    prepareRegistrySkillPublication,
    publishPreparedRegistrySkillPublication,
    validateRegistrySkillPublicationTargets,
} from "./registry-skill-publication.ts";
import {
    downloadRegistryPackageTarball,
    loadRegistryPackageSkillInfo,
    tryReportRegistryPackageDownload,
} from "./registry-skill-source.ts";
import {
    isSkillDirectoryAbsent,
    managedMetadataOfKind,
    readSkillDirectoryState,
} from "./skill-directory-state.ts";
import {
    selectFilteredSkills,
} from "./skill-filter.ts";
import { createSkillIdsTelemetryProperties } from "./telemetry.ts";

interface ManagedSkillPathState {
    exists: boolean;
    metadataPackageName: string | undefined;
}

export interface RegistrySkillInstallRequest {
    force?: boolean;
    packageName: string;
    packageShareId?: string;
    packageVersion?: string;
    recordTelemetry?: boolean;
    // The `--skill` narrowing for the install command. When provided, only the
    // package's published skills whose name (or directory basename) matches one
    // of these values are installed; unmatched values are ignored. Ignored when
    // `skillNames` is non-empty.
    skillFilter?: readonly string[];
    // Invoked with this package's published skill names when `skillFilter`
    // matched none of them. A no-match always installs nothing for the package;
    // whether an empty result across all packages is an error is decided by the
    // caller (the install command's cross-package match tracker), which uses
    // these names to list what was available.
    reportSkillFilterMiss?: (availableSkillNames: readonly string[]) => void;
    // When non-empty, install exactly these skills (used by `oo skills sync`).
    // When empty, the install command installs all published skills.
    skillNames: string[];
    writeOutput?: boolean;
}

type RegistrySkillInstallStatus = "conflict" | "installed" | "new";

export async function installRegistrySkills(
    request: RegistrySkillInstallRequest,
    context: CliExecutionContext,
): Promise<ManagedSkillInstallSummary[]> {
    const { account } = await requireIdentity(context);
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);
    const shouldRecordTelemetry = request.recordTelemetry !== false;
    const shouldWriteOutput = request.writeOutput !== false;

    if (availableHosts.length === 0) {
        throw createMissingManagedSkillHostError(context.env);
    }

    const packageInfo = await loadRegistryPackageSkillInfo(
        request.packageName,
        account,
        context,
        request.packageVersion,
    );
    if (shouldRecordTelemetry) {
        context.telemetry?.recordProperties({
            package_kind: "registry",
            package_name: packageInfo.packageName,
            ...createSkillIdsTelemetryProperties([]),
        });
    }

    if (packageInfo.skills.length === 0) {
        throw new CliUserError("errors.skills.install.noPublishedSkills", 1, {
            packageName: packageInfo.packageName,
        });
    }

    const installSkillNames = await resolveInstallSkillNames(
        request,
        packageInfo,
        availableHosts,
        context,
    );

    if (installSkillNames.length === 0) {
        return [];
    }

    if (shouldRecordTelemetry) {
        context.telemetry?.recordProperties(
            createSkillIdsTelemetryProperties(installSkillNames),
        );
    }

    const settingsFilePath = context.settingsStore.getFilePath();

    for (const skillName of installSkillNames) {
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
    }

    const summaries = await executeInstallActions(
        installSkillNames,
        packageInfo,
        request.packageShareId,
        account,
        availableHosts,
        settingsFilePath,
        context,
        request.force === true,
    );

    if (shouldWriteOutput) {
        writeManagedSkillInstallSummary(context, summaries);
    }

    return summaries;
}

async function executeInstallActions(
    skillNames: readonly string[],
    packageInfo: RegistryPackageSkillInfo,
    packageShareId: string | undefined,
    account: AuthAccount,
    availableHosts: readonly ManagedSkillHost[],
    settingsFilePath: string,
    context: CliExecutionContext,
    force: boolean,
): Promise<ManagedSkillInstallSummary[]> {
    for (const skillName of skillNames) {
        await validateRegistrySkillPublicationTargets({
            context,
            force,
            hostInstallations: resolveManagedSkillHostInstallations(
                availableHosts,
                skillName,
            ),
            skillName,
        });
    }

    await tryReportRegistryPackageDownload(
        packageInfo.packageName,
        packageInfo.packageVersion,
        account,
        context,
    );
    const packageBytes = await downloadRegistryPackageTarball(
        packageInfo.packageName,
        packageInfo.packageVersion,
        account,
        context,
        packageShareId,
    );
    const extractedPackage = await extractRegistryPackageArchive(packageBytes);

    try {
        const summaries: ManagedSkillInstallSummary[] = [];

        for (const skillName of skillNames) {
            const skill = findPackageSkillOrThrow(packageInfo.skills, skillName, packageInfo.packageName);
            const hostInstallations = resolveManagedSkillHostInstallations(
                availableHosts,
                skillName,
            );
            const publications = await publishPreparedRegistrySkillPublication(
                await prepareRegistrySkillPublication({
                    extractedPackage,
                    hostInstallations,
                    packageName: packageInfo.packageName,
                    packageVersion: packageInfo.packageVersion,
                    settingsFilePath,
                    skill,
                    skillName,
                }),
            );

            summaries.push({
                name: skillName,
                publications: publications.map(publication => ({
                    agentName: publication.agentName,
                    path: publication.path,
                }) satisfies ManagedSkillInstallPublication),
            });

            for (const publication of publications) {
                context.logger.info(
                    {
                        ...withPackageIdentity(
                            packageInfo.packageName,
                            packageInfo.packageVersion,
                        ),
                        agentName: publication.agentName,
                        path: publication.path,
                        skillName,
                    },
                    "Registry skill installed explicitly.",
                );
            }
        }

        return summaries;
    }
    finally {
        await extractedPackage.cleanup();
    }
}

async function resolveInstallSkillNames(
    request: RegistrySkillInstallRequest,
    packageInfo: RegistryPackageSkillInfo,
    availableHosts: readonly ManagedSkillHost[],
    context: Pick<
        CliExecutionContext,
        "settingsStore" | "stdin" | "stdout" | "translator"
    >,
): Promise<string[]> {
    const shouldWriteOutput = request.writeOutput !== false;

    // Explicit skill selection is used internally by `oo skills sync` to
    // reinstall a specific managed skill from a package.
    if (request.skillNames.length > 0) {
        for (const skillName of request.skillNames) {
            findPackageSkillOrThrow(packageInfo.skills, skillName, packageInfo.packageName);
        }

        return filterConfirmedSkillNames(
            packageInfo.packageName,
            request.skillNames,
            availableHosts,
            context,
            shouldWriteOutput,
            request.force === true,
        );
    }

    // Default behavior: install every published skill in the package, narrowed
    // by the optional `--skill` filter.
    const selectedSkills = selectFilteredSkills(
        packageInfo.skills,
        request.skillFilter,
        request.reportSkillFilterMiss,
    );

    if (selectedSkills.length === 0) {
        // `--skill` matched nothing in this package; the miss was reported to the
        // caller, which decides whether this is a global no-match error. Install
        // nothing here and emit no selection line.
        return [];
    }

    if (selectedSkills.length === 1) {
        writeInstallSelectionLine(context, shouldWriteOutput, "skills.install.singleSelected", {
            name: selectedSkills[0]!.name,
        });

        return [selectedSkills[0]!.name];
    }

    if (selectedSkills.length < packageInfo.skills.length) {
        // `--skill` narrowed the package to a strict subset of more than one
        // skill; avoid the misleading "all" wording.
        writeInstallSelectionLine(context, shouldWriteOutput, "skills.install.filteredSelected", {
            count: selectedSkills.length,
            total: packageInfo.skills.length,
        });
    }
    else {
        writeInstallSelectionLine(context, shouldWriteOutput, "skills.install.allSelected", {
            count: selectedSkills.length,
        });
    }

    return selectedSkills.map(skill => skill.name);
}

async function filterConfirmedSkillNames(
    packageName: string,
    skillNames: readonly string[],
    availableHosts: readonly ManagedSkillHost[],
    context: Pick<
        CliExecutionContext,
        "settingsStore" | "stdin" | "stdout" | "translator"
    >,
    shouldWriteOutput: boolean,
    force: boolean,
): Promise<string[]> {
    const confirmedSkillNames: string[] = [];

    for (const skillName of skillNames) {
        if (force) {
            // --force bypasses the conflict check; the unmanaged-directory
            // warning is emitted later by validateRegistrySkillPublicationTargets.
            confirmedSkillNames.push(skillName);
            continue;
        }

        const status = await readRegistrySkillInstallStatus(
            packageName,
            skillName,
            availableHosts,
            context.settingsStore.getFilePath(),
        );

        if (status !== "conflict") {
            confirmedSkillNames.push(skillName);
            continue;
        }

        if (context.stdin.isTTY !== true) {
            throw new CliUserError(
                "errors.skills.install.confirmationRequired",
                1,
                {
                    name: skillName,
                },
            );
        }

        const confirmed = await confirmInteractiveValue(
            context,
            {
                invalidMessage: context.translator.t(
                    "skills.install.overwrite.invalid",
                ),
                prompt: context.translator.t(
                    "skills.install.overwrite.prompt",
                    {
                        name: skillName,
                    },
                ),
            },
        );

        if (!confirmed) {
            writeInstallSelectionLine(context, shouldWriteOutput, "skills.install.skipped", {
                name: skillName,
            });
            continue;
        }

        confirmedSkillNames.push(skillName);
    }

    return confirmedSkillNames;
}

function writeInstallSelectionLine(
    context: Pick<CliExecutionContext, "stdout" | "translator">,
    shouldWriteOutput: boolean,
    key: string,
    params: Record<string, string | number>,
): void {
    if (!shouldWriteOutput) {
        return;
    }

    writeLine(context.stdout, context.translator.t(key, params));
}

export function findPackageSkillOrThrow(
    skills: readonly RegistrySkillSummary[],
    skillName: string,
    packageName: string,
): RegistrySkillSummary {
    const skill = skills.find(entry => entry.name === skillName);

    if (skill === undefined) {
        throw new CliUserError("errors.skills.install.skillNotFound", 1, {
            name: skillName,
            packageName,
        });
    }

    return skill;
}

async function readRegistrySkillInstallStatus(
    packageName: string,
    skillName: string,
    availableHosts: readonly ManagedSkillHost[],
    settingsFilePath: string,
): Promise<RegistrySkillInstallStatus> {
    const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillName,
    );
    const hostInstallations = resolveManagedSkillHostInstallations(
        availableHosts,
        skillName,
    );
    const [canonicalState, installedStates] = await Promise.all([
        readManagedSkillPathState(canonicalSkillDirectoryPath),
        Promise.all(hostInstallations.map(installation =>
            readManagedSkillPathState(installation.installedSkillDirectoryPath),
        )),
    ]);

    if (
        hasManagedSkillPathConflict(canonicalState, packageName)
        || installedStates.some(state =>
            hasManagedSkillPathConflict(state, packageName),
        )
    ) {
        return "conflict";
    }

    if (
        canonicalState.metadataPackageName === packageName
        || installedStates.some(state => state.metadataPackageName === packageName)
    ) {
        return "installed";
    }

    return "new";
}

async function readManagedSkillPathState(
    skillDirectoryPath: string,
): Promise<ManagedSkillPathState> {
    const state = await readSkillDirectoryState(skillDirectoryPath);

    if (isSkillDirectoryAbsent(state)) {
        return {
            exists: false,
            metadataPackageName: undefined,
        };
    }

    return {
        exists: true,
        metadataPackageName: managedMetadataOfKind(state, "registry")?.packageName,
    };
}

function hasManagedSkillPathConflict(
    state: ManagedSkillPathState,
    packageName: string,
): boolean {
    return state.exists && state.metadataPackageName !== packageName;
}
