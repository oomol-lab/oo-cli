import type { CliExecutionContext } from "../../contracts/cli.ts";
import { cp, mkdir } from "node:fs/promises";

import { dirname } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import { withPackageIdentity } from "../../logging/log-fields.ts";
import {
    publishBundledSkillInstallation,
    removePath,
} from "./bundled-skill-filesystem.ts";
import { directoryExists, requireCodexHomeDirectory } from "./bundled-skill-observation.ts";
import {
    confirmInteractiveValue,
    selectInteractiveSkills,
} from "./interactive-prompts.ts";
import {
    readManagedSkillMetadata,
    writeManagedSkillMetadata,
} from "./managed-skill-metadata.ts";
import {
    isManagedSkillPathContained,
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    extractRegistryPackageArchive,
    requireExtractedRegistrySkillDirectory,
} from "./registry-skill-archive.ts";
import { rewriteInstalledRegistrySkillMarkdown } from "./registry-skill-markdown.ts";
import {
    downloadRegistryPackageTarball,
    loadRegistryPackageSkillInfo,
    requireCurrentSkillsInstallAccount,
} from "./registry-skill-source.ts";

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

    const selectedSkillNames = await resolveSelectedSkillNames(
        request,
        packageInfo,
        codexHomeDirectory,
        context,
    );

    if (selectedSkillNames.length === 0) {
        return;
    }

    const settingsFilePath = context.settingsStore.getFilePath();

    for (const skillName of selectedSkillNames) {
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

    const packageBytes = await downloadRegistryPackageTarball(
        packageInfo.packageName,
        packageInfo.packageVersion,
        account,
        context,
    );
    const extractedPackage = await extractRegistryPackageArchive(packageBytes);

    try {
        for (const skillName of selectedSkillNames) {
            const skill = findPackageSkillOrThrow(packageInfo, skillName);
            const canonicalSkillDirectoryPath
                = resolveManagedSkillCanonicalDirectoryPath(
                    settingsFilePath,
                    skillName,
                );
            const installedSkillDirectoryPath = resolveManagedSkillDirectoryPath(
                codexHomeDirectory,
                skillName,
            );

            await removePath(canonicalSkillDirectoryPath);
            await mkdir(dirname(canonicalSkillDirectoryPath), { recursive: true });
            await cp(
                await requireExtractedRegistrySkillDirectory(
                    extractedPackage,
                    skillName,
                ),
                canonicalSkillDirectoryPath,
                {
                    force: true,
                    recursive: true,
                },
            );
            await rewriteInstalledRegistrySkillMarkdown(
                canonicalSkillDirectoryPath,
                skill,
                packageInfo.packageName,
            );
            await writeManagedSkillMetadata(
                canonicalSkillDirectoryPath,
                {
                    packageName: packageInfo.packageName,
                    version: packageInfo.packageVersion,
                },
            );

            const installation = await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath,
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

async function resolveSelectedSkillNames(
    request: RegistrySkillInstallRequest,
    packageInfo: Awaited<ReturnType<typeof loadRegistryPackageSkillInfo>>,
    codexHomeDirectory: string,
    context: Pick<
        CliExecutionContext,
        "settingsStore" | "stdin" | "stdout" | "translator"
    >,
): Promise<string[]> {
    if (request.all) {
        writeLine(
            context,
            context.translator.t("skills.install.allSelected", {
                count: packageInfo.skills.length,
            }),
        );

        return packageInfo.skills.map(skill => skill.name);
    }

    if (request.skillNames.includes("*")) {
        writeLine(
            context,
            context.translator.t("skills.install.allSelected", {
                count: packageInfo.skills.length,
            }),
        );

        return packageInfo.skills.map(skill => skill.name);
    }

    if (request.skillNames.length > 0) {
        const selectedSkillNames = request.skillNames.flatMap((skillName) => {
            findPackageSkillOrThrow(packageInfo, skillName);

            return skillName;
        });

        return await filterConfirmedSkillNames(
            packageInfo.packageName,
            selectedSkillNames,
            codexHomeDirectory,
            context,
        );
    }

    if (packageInfo.skills.length === 1) {
        const firstSkill = packageInfo.skills[0]!;

        writeLine(
            context,
            context.translator.t("skills.install.singleSelected", {
                name: firstSkill.name,
            }),
        );

        return [firstSkill.name];
    }

    if (request.yes) {
        writeLine(
            context,
            context.translator.t("skills.install.allSelected", {
                count: packageInfo.skills.length,
            }),
        );

        return packageInfo.skills.map(skill => skill.name);
    }

    if (context.stdin.isTTY !== true || context.stdout.isTTY !== true) {
        throw new CliUserError("errors.skills.install.nonInteractiveSelection", 1, {
            packageName: packageInfo.packageName,
        });
    }

    return await selectInteractiveSkills(
        context,
        {
            items: await Promise.all(
                packageInfo.skills.map(async skill => ({
                    description: skill.description,
                    name: skill.name,
                    statusLabel: readRegistrySkillStatusLabel(
                        await readRegistrySkillInstallStatus(
                            packageInfo.packageName,
                            skill.name,
                            codexHomeDirectory,
                            context.settingsStore.getFilePath(),
                        ),
                        context.translator,
                    ),
                    title: skill.title,
                })),
            ),
            prompt: context.translator.t("skills.install.selection.prompt"),
        },
    );
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
                context,
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

function findPackageSkillOrThrow(
    packageInfo: Awaited<ReturnType<typeof loadRegistryPackageSkillInfo>>,
    skillName: string,
): Awaited<ReturnType<typeof loadRegistryPackageSkillInfo>>["skills"][number] {
    const skill = packageInfo.skills.find(entry => entry.name === skillName);

    if (skill === undefined) {
        throw new CliUserError("errors.skills.install.skillNotFound", 1, {
            name: skillName,
            packageName: packageInfo.packageName,
        });
    }

    return skill;
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
        isSameManagedRegistryPackage(canonicalState.metadataPackageName, packageName)
        || isSameManagedRegistryPackage(installedState.metadataPackageName, packageName)
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
    return state.exists
        && !isSameManagedRegistryPackage(state.metadataPackageName, packageName);
}

function isSameManagedRegistryPackage(
    metadataPackageName: string | undefined,
    packageName: string,
): boolean {
    return metadataPackageName === packageName;
}

function readRegistrySkillStatusLabel(
    status: RegistrySkillInstallStatus,
    translator: Pick<CliExecutionContext["translator"], "t">,
): string | undefined {
    switch (status) {
        case "conflict":
            return translator.t("skills.install.status.conflict");
        case "installed":
            return translator.t("skills.install.status.installed");
        case "new":
            return undefined;
    }
}

function writeLine(
    context: Pick<CliExecutionContext, "stdout">,
    message: string,
): void {
    context.stdout.write(`${message}\n`);
}
