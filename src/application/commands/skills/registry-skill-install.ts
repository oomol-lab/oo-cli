import type { CliExecutionContext } from "../../contracts/cli.ts";

import type { RegistrySkillSummary } from "./registry-skill-source.ts";

import { CliUserError } from "../../contracts/cli.ts";
import { withPackageIdentity } from "../../logging/log-fields.ts";

import { writeLine } from "../shared/output.ts";
import { directoryExists, requireCodexHomeDirectory } from "./bundled-skill-observation.ts";
import { SkillsInstallProgressReporter } from "./install-progress.ts";
import {
    confirmInteractiveValue,
    selectInteractiveSkills,
} from "./interactive-prompts.ts";
import {
    readManagedSkillMetadata,
} from "./managed-skill-metadata.ts";
import {
    isManagedSkillPathContained,
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
} from "./managed-skill-paths.ts";
import { extractRegistryPackageArchive } from "./registry-skill-archive.ts";
import {
    prepareRegistrySkillPublication,
    publishPreparedRegistrySkillPublication,
} from "./registry-skill-publication.ts";
import {
    downloadRegistryPackageTarball,
    loadRegistryPackageSkillInfo,
    requireCurrentSkillsInstallAccount,
} from "./registry-skill-source.ts";
import { uninstallManagedSkill } from "./shared.ts";

interface ManagedSkillPathState {
    exists: boolean;
    metadataPackageName: string | undefined;
}

export interface RegistrySkillInstallRequest {
    all: boolean;
    packageName: string;
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
    const account = await requireCurrentSkillsInstallAccount(context);
    const codexHomeDirectory = await requireCodexHomeDirectory(context);
    const packageInfo = await loadRegistryPackageSkillInfo(
        request.packageName,
        account,
        context,
    );

    if (packageInfo.skills.length === 0) {
        throw new CliUserError("errors.skills.install.noPublishedSkills", 1, {
            packageName: packageInfo.packageName,
        });
    }

    const selectionActions = await resolveSelectionActions(
        request,
        packageInfo,
        codexHomeDirectory,
        context,
    );

    if (selectionActions.actions.length === 0) {
        return;
    }

    const settingsFilePath = context.settingsStore.getFilePath();

    for (const { skillName } of selectionActions.actions) {
        if (!isManagedSkillPathContained(
            codexHomeDirectory,
            settingsFilePath,
            skillName,
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
                await executeInstallActions(
                    installActions,
                    packageInfo,
                    account,
                    codexHomeDirectory,
                    settingsFilePath,
                    selectionActions.isInteractive,
                    context,
                );
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
                    await uninstallManagedSkill(skillName, context, {
                        silent: selectionActions.isInteractive,
                    });
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
    packageInfo: Awaited<ReturnType<typeof loadRegistryPackageSkillInfo>>,
    account: Awaited<ReturnType<typeof requireCurrentSkillsInstallAccount>>,
    codexHomeDirectory: string,
    settingsFilePath: string,
    isInteractive: boolean,
    context: CliExecutionContext,
): Promise<void> {
    const packageBytes = await downloadRegistryPackageTarball(
        packageInfo.packageName,
        packageInfo.packageVersion,
        account,
        context,
    );
    const extractedPackage = await extractRegistryPackageArchive(packageBytes);

    try {
        for (const { skillName } of installActions) {
            const skill = findPackageSkillOrThrow(packageInfo.skills, skillName, packageInfo.packageName);
            const installation = await publishPreparedRegistrySkillPublication(
                await prepareRegistrySkillPublication({
                    codexHomeDirectory,
                    extractedPackage,
                    packageName: packageInfo.packageName,
                    packageVersion: packageInfo.packageVersion,
                    settingsFilePath,
                    skill,
                    skillName,
                }),
            );

            if (!isInteractive) {
                writeLine(
                    context.stdout,
                    context.translator.t("skills.install.success", {
                        name: skillName,
                        path: installation.path,
                    }),
                );
            }

            context.logger.info(
                {
                    ...withPackageIdentity(
                        packageInfo.packageName,
                        packageInfo.packageVersion,
                    ),
                    installMode: installation.mode,
                    path: installation.path,
                    skillName,
                },
                "Registry Codex skill installed explicitly.",
            );
        }
    }
    finally {
        await extractedPackage.cleanup();
    }
}

async function resolveSelectionActions(
    request: RegistrySkillInstallRequest,
    packageInfo: Awaited<ReturnType<typeof loadRegistryPackageSkillInfo>>,
    codexHomeDirectory: string,
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
        const selectedSkillNames = request.skillNames.flatMap((skillName) => {
            findPackageSkillOrThrow(packageInfo.skills, skillName, packageInfo.packageName);

            return skillName;
        });

        return {
            actions: createInstallActions(
                await filterConfirmedSkillNames(
                    packageInfo.packageName,
                    selectedSkillNames,
                    codexHomeDirectory,
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
        codexHomeDirectory,
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
    codexHomeDirectory: string,
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
            codexHomeDirectory,
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
    packageInfo: Awaited<ReturnType<typeof loadRegistryPackageSkillInfo>>,
    codexHomeDirectory: string,
    settingsFilePath: string,
): Promise<RegistrySkillState[]> {
    return await Promise.all(
        packageInfo.skills.map(async skill => ({
            description: skill.description,
            name: skill.name,
            status: await readRegistrySkillInstallStatus(
                packageInfo.packageName,
                skill.name,
                codexHomeDirectory,
                settingsFilePath,
            ),
            title: skill.title,
        })),
    );
}

async function readRegistrySkillInstallStatus(
    packageName: string,
    skillName: string,
    codexHomeDirectory: string,
    settingsFilePath: string,
): Promise<RegistrySkillInstallStatus> {
    const canonicalSkillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillName,
    );
    const installedSkillDirectoryPath = resolveManagedSkillDirectoryPath(
        codexHomeDirectory,
        skillName,
    );
    const [canonicalState, installedState] = await Promise.all([
        readManagedSkillPathState(canonicalSkillDirectoryPath),
        readManagedSkillPathState(installedSkillDirectoryPath),
    ]);

    if (
        hasManagedSkillPathConflict(canonicalState, packageName)
        || hasManagedSkillPathConflict(installedState, packageName)
    ) {
        return "conflict";
    }

    if (
        canonicalState.metadataPackageName === packageName
        || installedState.metadataPackageName === packageName
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
