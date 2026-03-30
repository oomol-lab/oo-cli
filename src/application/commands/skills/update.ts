import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { ManagedSkillListItem } from "./list.ts";
import type { PreparedRegistrySkillPublication } from "./registry-skill-publication.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import {
    directoryExists,
    fileExists,
    requireCodexHomeDirectory,
} from "./bundled-skill-observation.ts";
import { listManagedSkillInstallations } from "./list.ts";
import {
    isManagedSkillPathContained,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillMetadataFilePath,
    resolveManagedSkillsDirectoryPath,
} from "./managed-skill-paths.ts";
import { extractRegistryPackageArchive } from "./registry-skill-archive.ts";
import {
    findPackageSkillOrThrow,
} from "./registry-skill-install.ts";
import {
    prepareRegistrySkillPublication,
    publishPreparedRegistrySkillPublication,
} from "./registry-skill-publication.ts";
import {
    downloadRegistryPackageTarball,
    loadRegistryPackageSkillInfo,
    requireCurrentSkillsInstallAccount,
} from "./registry-skill-source.ts";
import { isBundledSkillName, writeLine } from "./shared.ts";
import { SkillsUpdateProgressReporter } from "./update-progress.ts";

interface SkillsUpdateInput {
    skill?: string[];
}

interface RegistrySkillGroup {
    packageName: string;
    skills: ManagedSkillListItem[];
}

interface CurrentSkillUpdate {
    kind: "current";
    skillName: string;
    version: string;
}

interface FailedSkillUpdate {
    error: Error;
    kind: "failed";
    skillName: string;
}

interface RegistryPreparedSkillUpdate {
    kind: "registry";
    preparedPublication: PreparedRegistrySkillPublication;
}

type SkillUpdateEvent = CurrentSkillUpdate | FailedSkillUpdate;

interface SkillPreparationResult {
    events: SkillUpdateEvent[];
    publications: RegistryPreparedSkillUpdate[];
}

export const skillsUpdateCommand: CliCommandDefinition<SkillsUpdateInput> = {
    name: "update",
    summaryKey: "commands.skills.update.summary",
    descriptionKey: "commands.skills.update.description",
    arguments: [
        {
            name: "skill",
            descriptionKey: "arguments.skill",
            required: false,
            variadic: true,
        },
    ],
    inputSchema: z.object({
        skill: z.array(z.string()).optional(),
    }),
    handler: async (input, context) => {
        await updateManagedSkills(
            {
                skillNames: input.skill ?? [],
            },
            context,
        );
    },
};

export async function updateManagedSkills(
    request: {
        skillNames: readonly string[];
    },
    context: CliExecutionContext,
): Promise<void> {
    const codexHomeDirectory = await requireCodexHomeDirectory(context);
    const settingsFilePath = context.settingsStore.getFilePath();
    const installedSkills = await listManagedSkillInstallations(
        resolveManagedSkillsDirectoryPath(codexHomeDirectory),
    );
    const selectedSkills = await resolveSelectedManagedSkills(
        request.skillNames,
        installedSkills,
        codexHomeDirectory,
        settingsFilePath,
    );

    if (selectedSkills.length === 0) {
        writeLine(context, context.translator.t("skills.update.noResults"));
        return;
    }

    const progressReporter = context.stdout.isTTY === true
        ? new SkillsUpdateProgressReporter(
                context.stdout,
                selectedSkills.map(skill => skill.name),
                context.translator,
            )
        : undefined;
    const registrySkillGroups = groupRegistrySkills(selectedSkills);
    const unresolvedSkills = selectedSkills.filter(skill =>
        !isBundledSkillName(skill.name) && skill.metadata?.packageName === undefined,
    );
    const failures: Error[] = [];

    progressReporter?.start();

    try {
        const account = registrySkillGroups.length > 0
            ? await requireCurrentSkillsInstallAccount(context)
            : undefined;
        const phaseOneResults = await Promise.all([
            ...unresolvedSkills.map(skill => Promise.resolve({
                events: [
                    {
                        error: new CliUserError(
                            "errors.skills.update.packageNameMissing",
                            1,
                            {
                                name: skill.name,
                            },
                        ),
                        kind: "failed" as const,
                        skillName: skill.name,
                    },
                ],
                publications: [],
            })),
            ...registrySkillGroups.map(group =>
                prepareRegistrySkillGroupUpdate(
                    group,
                    {
                        account: account!,
                        codexHomeDirectory,
                        progressReporter,
                        settingsFilePath,
                    },
                    context,
                ),
            ),
        ]);
        const publications = phaseOneResults.flatMap(result => result.publications);

        for (const event of phaseOneResults.flatMap(result => result.events)) {
            if (event.kind === "failed") {
                failures.push(event.error);
                progressReporter?.updateSkill(event.skillName, "failed");
                writeUpdateFailureLine(context, event.skillName, event.error);
                continue;
            }

            progressReporter?.updateSkill(
                event.skillName,
                "current",
                context.translator.t("skills.update.current", {
                    name: event.skillName,
                    version: event.version,
                }),
            );
            writeUpdateCurrentLine(context, event.skillName, event.version);
        }

        const publicationResults: Array<
            | {
                error: Error;
                skillName: string;
            }
            | {
                installationPath: string;
                skillName: string;
            }
        > = await Promise.all(
            publications.map(async (publication) => {
                try {
                    progressReporter?.updateSkill(
                        publication.preparedPublication.skillName,
                        "publishing",
                    );
                    const installation = await publishPreparedRegistrySkillPublication(
                        publication.preparedPublication,
                    );

                    return {
                        installationPath: installation.path,
                        skillName: publication.preparedPublication.skillName,
                    };
                }
                catch (error) {
                    const normalizedError = normalizeSkillUpdateError(error);

                    failures.push(normalizedError);

                    return {
                        error: normalizedError,
                        skillName: publication.preparedPublication.skillName,
                    };
                }
            }),
        );

        for (const result of publicationResults) {
            if ("error" in result) {
                progressReporter?.updateSkill(result.skillName, "failed");
                writeUpdateFailureLine(context, result.skillName, result.error);
                continue;
            }

            progressReporter?.updateSkill(
                result.skillName,
                "updated",
                context.translator.t("skills.update.progress.updated"),
            );
            writeUpdateSuccessLine(
                context,
                result.skillName,
                result.installationPath,
            );
        }
    }
    finally {
        progressReporter?.stop();
    }

    const firstFailure = failures[0];

    if (firstFailure !== undefined) {
        throw firstFailure;
    }
}

async function resolveSelectedManagedSkills(
    requestedSkillNames: readonly string[],
    installedSkills: readonly ManagedSkillListItem[],
    codexHomeDirectory: string,
    settingsFilePath: string,
): Promise<ManagedSkillListItem[]> {
    if (requestedSkillNames.length === 0) {
        return installedSkills.filter(
            skill => !isBundledSkillName(skill.name),
        );
    }

    const selectedSkills: ManagedSkillListItem[] = [];
    const installedSkillIndex = new Map(
        installedSkills.map(skill => [skill.name, skill] as const),
    );
    const seenSkillNames = new Set<string>();

    for (const requestedSkillName of requestedSkillNames) {
        if (seenSkillNames.has(requestedSkillName)) {
            continue;
        }

        seenSkillNames.add(requestedSkillName);

        if (isBundledSkillName(requestedSkillName)) {
            throw new CliUserError(
                "errors.skills.update.bundledUnsupported",
                1,
                {
                    name: requestedSkillName,
                },
            );
        }

        if (
            !isManagedSkillPathContained(
                codexHomeDirectory,
                settingsFilePath,
                requestedSkillName,
            )
        ) {
            throw new CliUserError("errors.skills.invalidPath", 1, {
                name: requestedSkillName,
            });
        }

        const installedSkill = installedSkillIndex.get(requestedSkillName);

        if (installedSkill !== undefined) {
            selectedSkills.push(installedSkill);
            continue;
        }

        const installedSkillDirectoryPath = resolveManagedSkillDirectoryPath(
            codexHomeDirectory,
            requestedSkillName,
        );
        const installedDirectoryExists = await directoryExists(
            installedSkillDirectoryPath,
        );

        throw new CliUserError(
            installedDirectoryExists
            && !(await fileExists(
                resolveManagedSkillMetadataFilePath(installedSkillDirectoryPath),
            ))
                ? "errors.skills.notManaged"
                : "errors.skills.notInstalled",
            1,
            {
                name: requestedSkillName,
                path: installedSkillDirectoryPath,
            },
        );
    }

    return selectedSkills;
}

function groupRegistrySkills(
    skills: readonly ManagedSkillListItem[],
): RegistrySkillGroup[] {
    const groups = new Map<string, ManagedSkillListItem[]>();

    for (const skill of skills) {
        const packageName = skill.metadata?.packageName;

        if (packageName === undefined) {
            continue;
        }

        const group = groups.get(packageName);

        if (group === undefined) {
            groups.set(packageName, [skill]);
            continue;
        }

        group.push(skill);
    }

    return Array.from(groups.entries(), ([packageName, groupedSkills]) => ({
        packageName,
        skills: groupedSkills,
    }));
}

async function prepareRegistrySkillGroupUpdate(
    group: RegistrySkillGroup,
    options: {
        account: Awaited<ReturnType<typeof requireCurrentSkillsInstallAccount>>;
        codexHomeDirectory: string;
        progressReporter?: SkillsUpdateProgressReporter;
        settingsFilePath: string;
    },
    context: CliExecutionContext,
): Promise<SkillPreparationResult> {
    try {
        for (const skill of group.skills) {
            options.progressReporter?.updateSkill(skill.name, "checking");
        }

        const packageInfo = await loadRegistryPackageSkillInfo(
            group.packageName,
            options.account,
            context,
        );

        if (
            group.skills.every(
                skill => skill.metadata?.version === packageInfo.packageVersion,
            )
        ) {
            return {
                events: group.skills.map(skill => ({
                    kind: "current",
                    skillName: skill.name,
                    version: packageInfo.packageVersion,
                })),
                publications: [],
            };
        }

        for (const skill of group.skills) {
            options.progressReporter?.updateSkill(skill.name, "preparing");
        }

        const packageBytes = await downloadRegistryPackageTarball(
            packageInfo.packageName,
            packageInfo.packageVersion,
            options.account,
            context,
        );
        const extractedPackage = await extractRegistryPackageArchive(packageBytes);

        try {
            return {
                events: [],
                publications: await Promise.all(
                    group.skills.map(async skill => ({
                        kind: "registry",
                        preparedPublication: await prepareRegistrySkillPublication({
                            codexHomeDirectory: options.codexHomeDirectory,
                            extractedPackage,
                            packageName: packageInfo.packageName,
                            packageVersion: packageInfo.packageVersion,
                            settingsFilePath: options.settingsFilePath,
                            skill: findPackageSkillOrThrow(
                                packageInfo.skills,
                                skill.name,
                                packageInfo.packageName,
                            ),
                            skillName: skill.name,
                        }),
                    })),
                ),
            };
        }
        finally {
            await extractedPackage.cleanup();
        }
    }
    catch (error) {
        const normalizedError = normalizeSkillUpdateError(error);

        return {
            events: group.skills.map(skill => ({
                error: normalizedError,
                kind: "failed",
                skillName: skill.name,
            })),
            publications: [],
        };
    }
}

function normalizeSkillUpdateError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }

    return new Error(String(error));
}

function writeUpdateSuccessLine(
    context: CliExecutionContext,
    skillName: string,
    installationPath: string,
): void {
    if (context.stdout.isTTY === true) {
        return;
    }

    writeLine(
        context,
        context.translator.t("skills.update.success", {
            name: skillName,
            path: installationPath,
        }),
    );
}

function writeUpdateCurrentLine(
    context: CliExecutionContext,
    skillName: string,
    version: string,
): void {
    if (context.stdout.isTTY === true) {
        return;
    }

    writeLine(
        context,
        context.translator.t("skills.update.current", {
            name: skillName,
            version,
        }),
    );
}

function writeUpdateFailureLine(
    context: CliExecutionContext,
    skillName: string,
    error: Error,
): void {
    if (context.stdout.isTTY === true) {
        return;
    }

    writeLine(
        context,
        context.translator.t("skills.update.failure", {
            message: localizeSkillUpdateError(error, context),
            name: skillName,
        }),
    );
}

function localizeSkillUpdateError(
    error: Error,
    context: Pick<CliExecutionContext, "translator">,
): string {
    if (error instanceof CliUserError) {
        return context.translator.t(error.key, error.params);
    }

    return error.message;
}
