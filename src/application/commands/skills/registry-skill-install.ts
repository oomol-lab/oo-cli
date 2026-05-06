import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type {
    ManagedSkillInstallPublication,
    ManagedSkillInstallSummary,
} from "./install-output.ts";
import type { ManagedSkillHost } from "./managed-skill-hosts.ts";
import type { RegistryPackageSkillInfo, RegistrySkillSummary } from "./registry-skill-source.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { withPackageIdentity } from "../../logging/log-fields.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { writeLine } from "../shared/output.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
import { writeManagedSkillInstallSummary } from "./install-output.ts";
import { SkillsInstallProgressReporter } from "./install-progress.ts";
import {
    confirmInteractiveValue,
    selectInteractiveSkills,
} from "./interactive-prompts.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import {
    readManagedSkillMetadata,
} from "./managed-skill-metadata.ts";
import {
    isManagedSkillPathContained,
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    createManagedSkillUninstallResultError,
    uninstallRegistrySkill,
} from "./managed-skill-uninstall.ts";
import { extractRegistryPackageArchive } from "./registry-skill-archive.ts";
import {
    prepareRegistrySkillPublication,
    publishPreparedRegistrySkillPublication,
    validateRegistrySkillPublicationTargets,
} from "./registry-skill-publication.ts";
import {
    downloadRegistryPackageTarball,
    loadRegistryPackageSkillInfo,
} from "./registry-skill-source.ts";

interface ManagedSkillPathState {
    exists: boolean;
    metadataPackageName: string | undefined;
}

export interface RegistrySkillInstallRequest {
    all: boolean;
    packageName: string;
    packageVersion?: string;
    skillNames: string[];
    yes: boolean;
}

interface RegistrySkillSelectionResolution {
    actions: RegistrySkillSelectionAction[];
    isInteractive: boolean;
}

interface RegistrySkillSelectionAction {
    skillName: string;
    type: "install" | "uninstall";
}

interface RegistrySkillState {
    description: string;
    name: string;
    status: RegistrySkillInstallStatus;
    title: string;
}

type RegistrySkillInstallStatus = "conflict" | "installed" | "new";

export async function installRegistrySkills(
    request: RegistrySkillInstallRequest,
    context: CliExecutionContext,
): Promise<void> {
    const account = await requireCurrentAccount(context);
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

    if (availableHosts.length === 0) {
        throw createMissingManagedSkillHostError(context.env);
    }

    const packageInfo = await loadRegistryPackageSkillInfo(
        request.packageName,
        account,
        context,
        request.packageVersion,
    );

    if (packageInfo.skills.length === 0) {
        throw new CliUserError("errors.skills.install.noPublishedSkills", 1, {
            packageName: packageInfo.packageName,
        });
    }

    const selectionActions = await resolveSelectionActions(
        request,
        packageInfo,
        availableHosts,
        context,
    );

    if (selectionActions.actions.length === 0) {
        return;
    }

    const settingsFilePath = context.settingsStore.getFilePath();

    for (const { skillName } of selectionActions.actions) {
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

    const installActions = selectionActions.actions.filter(
        action => action.type === "install",
    );
    const uninstallActions = selectionActions.actions.filter(
        action => action.type === "uninstall",
    );
    const progressReporter = selectionActions.isInteractive
        ? new SkillsInstallProgressReporter(context.stdout, context.translator)
        : undefined;

    try {
        if (installActions.length > 0) {
            const installSkillNames = installActions.map(action => action.skillName);
            progressReporter?.startInstalling(installSkillNames);

            try {
                const summaries = await executeInstallActions(
                    installActions,
                    packageInfo,
                    account,
                    availableHosts,
                    settingsFilePath,
                    context,
                );

                if (!selectionActions.isInteractive) {
                    writeManagedSkillInstallSummary(context, summaries);
                }
            }
            catch (error) {
                progressReporter?.failInstalling();
                throw error;
            }

            progressReporter?.completeInstalling(installSkillNames);
        }

        if (uninstallActions.length > 0) {
            const uninstallSkillNames = uninstallActions.map(action => action.skillName);
            progressReporter?.startRemoving(uninstallSkillNames);

            try {
                for (const { skillName } of uninstallActions) {
                    const result = await uninstallRegistrySkill(skillName, context, {
                        silent: selectionActions.isInteractive,
                    });

                    if (!result.removed) {
                        throw createManagedSkillUninstallResultError({
                            context,
                            logMessage:
                                "Managed registry skill uninstall skipped because no OOMOL metadata was found.",
                            result,
                            skillName,
                        });
                    }
                }
            }
            catch (error) {
                progressReporter?.failRemoving();
                throw error;
            }

            progressReporter?.completeRemoving(uninstallSkillNames);
        }
    }
    finally {
        progressReporter?.stop();
    }
}

async function executeInstallActions(
    installActions: readonly RegistrySkillSelectionAction[],
    packageInfo: RegistryPackageSkillInfo,
    account: AuthAccount,
    availableHosts: readonly ManagedSkillHost[],
    settingsFilePath: string,
    context: CliExecutionContext,
): Promise<ManagedSkillInstallSummary[]> {
    for (const { skillName } of installActions) {
        await validateRegistrySkillPublicationTargets({
            hostInstallations: resolveManagedSkillHostInstallations(
                availableHosts,
                skillName,
            ),
            skillName,
        });
    }

    const packageBytes = await downloadRegistryPackageTarball(
        packageInfo.packageName,
        packageInfo.packageVersion,
        account,
        context,
    );
    const extractedPackage = await extractRegistryPackageArchive(packageBytes);

    try {
        const summaries: ManagedSkillInstallSummary[] = [];

        for (const { skillName } of installActions) {
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
                        installMode: publication.mode,
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

async function resolveSelectionActions(
    request: RegistrySkillInstallRequest,
    packageInfo: RegistryPackageSkillInfo,
    availableHosts: readonly ManagedSkillHost[],
    context: Pick<
        CliExecutionContext,
        "settingsStore" | "stdin" | "stdout" | "translator"
    >,
): Promise<RegistrySkillSelectionResolution> {
    if (request.all || request.skillNames.includes("*")) {
        writeLine(
            context.stdout,
            context.translator.t("skills.install.allSelected", {
                count: packageInfo.skills.length,
            }),
        );

        return {
            actions: createInstallActions(packageInfo.skills.map(skill => skill.name)),
            isInteractive: false,
        };
    }

    if (request.skillNames.length > 0) {
        for (const skillName of request.skillNames) {
            findPackageSkillOrThrow(packageInfo.skills, skillName, packageInfo.packageName);
        }

        return {
            actions: createInstallActions(
                await filterConfirmedSkillNames(
                    packageInfo.packageName,
                    request.skillNames,
                    availableHosts,
                    context,
                ),
            ),
            isInteractive: false,
        };
    }

    if (packageInfo.skills.length === 1) {
        const firstSkill = packageInfo.skills[0]!;

        writeLine(
            context.stdout,
            context.translator.t("skills.install.singleSelected", {
                name: firstSkill.name,
            }),
        );

        return {
            actions: createInstallActions([firstSkill.name]),
            isInteractive: false,
        };
    }

    if (request.yes) {
        writeLine(
            context.stdout,
            context.translator.t("skills.install.allSelected", {
                count: packageInfo.skills.length,
            }),
        );

        return {
            actions: createInstallActions(packageInfo.skills.map(skill => skill.name)),
            isInteractive: false,
        };
    }

    if (context.stdin.isTTY !== true || context.stdout.isTTY !== true) {
        throw new CliUserError("errors.skills.install.nonInteractiveSelection", 1, {
            packageName: packageInfo.packageName,
        });
    }

    const skillStates = await readRegistrySkillStates(
        packageInfo,
        availableHosts,
        context.settingsStore.getFilePath(),
    );
    const selectedSkillNames = await selectInteractiveSkills(
        context,
        {
            items: skillStates.map(skill => ({
                description: skill.description,
                name: skill.name,
                selected: skill.status === "installed",
                statusLabel: readRegistrySkillStatusLabel(
                    skill.status,
                    context.translator,
                ),
                title: skill.title,
            })),
            prompt: context.translator.t("skills.install.selection.prompt"),
        },
    );

    return {
        actions: skillStates.flatMap((skill) => {
            if (selectedSkillNames.includes(skill.name)) {
                return {
                    skillName: skill.name,
                    type: "install",
                } satisfies RegistrySkillSelectionAction;
            }

            if (skill.status === "installed") {
                return {
                    skillName: skill.name,
                    type: "uninstall",
                } satisfies RegistrySkillSelectionAction;
            }

            return [];
        }),
        isInteractive: true,
    };
}

async function filterConfirmedSkillNames(
    packageName: string,
    skillNames: readonly string[],
    availableHosts: readonly ManagedSkillHost[],
    context: Pick<
        CliExecutionContext,
        "settingsStore" | "stdin" | "stdout" | "translator"
    >,
): Promise<string[]> {
    const confirmedSkillNames: string[] = [];

    for (const skillName of skillNames) {
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
            writeLine(
                context.stdout,
                context.translator.t("skills.install.skipped", {
                    name: skillName,
                }),
            );
            continue;
        }

        confirmedSkillNames.push(skillName);
    }

    return confirmedSkillNames;
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

async function readRegistrySkillStates(
    packageInfo: RegistryPackageSkillInfo,
    availableHosts: readonly ManagedSkillHost[],
    settingsFilePath: string,
): Promise<RegistrySkillState[]> {
    return await Promise.all(
        packageInfo.skills.map(async skill => ({
            description: skill.description,
            name: skill.name,
            status: await readRegistrySkillInstallStatus(
                packageInfo.packageName,
                skill.name,
                availableHosts,
                settingsFilePath,
            ),
            title: skill.title,
        })),
    );
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
    if (!(await directoryExists(skillDirectoryPath))) {
        return {
            exists: false,
            metadataPackageName: undefined,
        };
    }

    return {
        exists: true,
        metadataPackageName: (await readManagedSkillMetadata(skillDirectoryPath))
            ?.packageName,
    };
}

function hasManagedSkillPathConflict(
    state: ManagedSkillPathState,
    packageName: string,
): boolean {
    return state.exists && state.metadataPackageName !== packageName;
}
function readRegistrySkillStatusLabel(
    status: RegistrySkillInstallStatus,
    translator: Pick<CliExecutionContext["translator"], "t">,
): string | undefined {
    switch (status) {
        case "conflict":
            return translator.t("skills.install.status.conflict");
        case "installed":
        case "new":
            return undefined;
    }
}

function createInstallActions(
    skillNames: readonly string[],
): RegistrySkillSelectionAction[] {
    return skillNames.map(skillName => ({
        skillName,
        type: "install",
    }));
}
