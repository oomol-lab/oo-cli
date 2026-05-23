import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";
import type { ManagedSkillListItem } from "./list.ts";
import type { ManagedSkillHost } from "./managed-skill-hosts.ts";
import type { PreparedRegistrySkillPublication } from "./registry-skill-publication.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { writeLine } from "../shared/output.ts";
import {
    directoryExists,
} from "./bundled-skill-observation.ts";
import {
    listManagedSkillInstallations,
    listManagedSkillInstallationsForHosts,
} from "./list.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import { readManagedSkillMetadata } from "./managed-skill-metadata.ts";
import {
    isManagedSkillPathContained,
    resolveManagedSkillCanonicalRootDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    isManagedSkillPublicationCurrent,
} from "./managed-skill-publication.ts";
import { extractRegistryPackageArchive } from "./registry-skill-archive.ts";
import {
    findPackageSkillOrThrow,
} from "./registry-skill-install.ts";
import {
    prepareRegistrySkillPublication,
    publishPreparedRegistrySkillPublication,
    validateRegistrySkillPublicationTargets,
} from "./registry-skill-publication.ts";
import {
    downloadRegistryPackageTarball,
    loadRegistryPackageSkillInfo,
} from "./registry-skill-source.ts";
import { isBundledSkillName } from "./shared.ts";
import {
    createPackageNamesTelemetryProperties,
    createSkillIdsTelemetryProperties,
} from "./telemetry.ts";
import { SkillsUpdateProgressReporter } from "./update-progress.ts";

interface SkillsUpdateInput {
    skill?: string[];
}

interface RegistrySkillGroup {
    packageName: string;
    skills: ManagedSkillUpdateItem[];
}

interface ManagedSkillUpdateItem extends ManagedSkillListItem {
    hostNames: BundledSkillAgentName[];
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
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

    if (availableHosts.length === 0) {
        throw createMissingManagedSkillHostError(context.env);
    }

    const settingsFilePath = context.settingsStore.getFilePath();
    const installedSkills = await readKnownManagedSkillInstallations(
        availableHosts,
        settingsFilePath,
    );
    const selectedSkills = await resolveSelectedManagedSkills(
        request.skillNames,
        installedSkills,
        availableHosts,
        settingsFilePath,
    );

    if (selectedSkills.length === 0) {
        writeLine(context.stdout, context.translator.t("skills.update.noResults"));
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
        !isBundledSkillName(skill.name) && skill.metadata?.kind !== "registry",
    );
    const packageNames = registrySkillGroups.map(group => group.packageName);
    context.telemetry?.recordProperties({
        package_kind: registrySkillGroups.length > 0 ? "registry" : "unknown",
        ...createSkillIdsTelemetryProperties(selectedSkills.map(skill => skill.name)),
        ...createPackageNamesTelemetryProperties(packageNames),
    });

    if (packageNames.length === 1) {
        context.telemetry?.recordProperties({
            package_name: packageNames[0]!,
        });
    }

    const failures: Error[] = [];

    progressReporter?.start();

    try {
        const account = registrySkillGroups.length > 0
            ? await requireCurrentAccount(context)
            : undefined;
        const unresolvedSkillFailures: SkillPreparationResult[] = unresolvedSkills.map(skill => ({
            events: [
                {
                    error: new CliUserError(
                        "errors.skills.update.packageNameMissing",
                        1,
                        {
                            hostNames: formatManagedSkillUpdateHostNames(skill.hostNames),
                            name: skill.name,
                        },
                    ),
                    kind: "failed" as const,
                    skillName: skill.name,
                },
            ],
            publications: [],
        }));
        const registryResults = await Promise.all(
            registrySkillGroups.map(group =>
                prepareRegistrySkillGroupUpdate(
                    group,
                    {
                        account: account!,
                        availableHosts,
                        progressReporter,
                        settingsFilePath,
                    },
                    context,
                ),
            ),
        );
        const phaseOneResults = [...unresolvedSkillFailures, ...registryResults];
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
        > = (await Promise.all(
            publications.map(async (publication) => {
                try {
                    progressReporter?.updateSkill(
                        publication.preparedPublication.skillName,
                        "publishing",
                    );
                    const installations = await publishPreparedRegistrySkillPublication(
                        publication.preparedPublication,
                    );

                    return installations.map(installation => ({
                        installationPath: installation.path,
                        skillName: publication.preparedPublication.skillName,
                    }));
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
        )).flat();

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

async function readKnownManagedSkillInstallations(
    availableHosts: readonly ManagedSkillHost[],
    settingsFilePath: string,
): Promise<ManagedSkillUpdateItem[]> {
    const [canonicalSkills, hostSkills] = await Promise.all([
        listManagedSkillInstallations(
            resolveManagedSkillCanonicalRootDirectoryPath(settingsFilePath),
        ),
        listManagedSkillInstallationsForHosts(availableHosts),
    ]);

    return mergeManagedSkillInstallationsByName([
        ...hostSkills.map(skill => ({
            metadata: skill.metadata,
            name: skill.name,
            path: skill.path,
            hostNames: [skill.hostName],
        } satisfies ManagedSkillUpdateItem)),
        ...canonicalSkills.map(skill => ({
            ...skill,
            hostNames: [],
        } satisfies ManagedSkillUpdateItem)),
    ]);
}

function mergeManagedSkillInstallationsByName(
    skills: readonly ManagedSkillUpdateItem[],
): ManagedSkillUpdateItem[] {
    const skillsByName = new Map<string, ManagedSkillUpdateItem>();

    for (const skill of skills) {
        if (skill.metadata?.kind !== "registry") {
            continue;
        }

        const existingSkill = skillsByName.get(skill.name);

        if (existingSkill === undefined) {
            skillsByName.set(skill.name, skill);
            continue;
        }

        const hostNames = mergeManagedSkillHostNames(
            existingSkill.hostNames,
            skill.hostNames,
        );

        skillsByName.set(skill.name, {
            ...existingSkill,
            hostNames,
        });
    }

    return Array.from(skillsByName.values());
}

function mergeManagedSkillHostNames(
    left: readonly BundledSkillAgentName[],
    right: readonly BundledSkillAgentName[],
): BundledSkillAgentName[] {
    const hostNames = new Set(left);

    for (const hostName of right) {
        hostNames.add(hostName);
    }

    return Array.from(hostNames);
}

function formatManagedSkillUpdateHostNames(
    hostNames: readonly BundledSkillAgentName[],
): string {
    if (hostNames.length === 0) {
        return "canonical";
    }

    return hostNames.join(", ");
}

async function resolveSelectedManagedSkills(
    requestedSkillNames: readonly string[],
    installedSkills: readonly ManagedSkillUpdateItem[],
    availableHosts: readonly ManagedSkillHost[],
    settingsFilePath: string,
): Promise<ManagedSkillUpdateItem[]> {
    if (requestedSkillNames.length === 0) {
        return installedSkills.filter(
            skill => !isBundledSkillName(skill.name),
        );
    }

    const selectedSkills: ManagedSkillUpdateItem[] = [];
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

        const hostInstallations = resolveManagedSkillHostInstallations(
            availableHosts,
            requestedSkillName,
        );

        if (hostInstallations.some(installation =>
            !isManagedSkillPathContained(
                installation.homeDirectory,
                settingsFilePath,
                requestedSkillName,
            ),
        )) {
            throw new CliUserError("errors.skills.invalidPath", 1, {
                name: requestedSkillName,
            });
        }

        const installedSkill = installedSkillIndex.get(requestedSkillName);

        if (installedSkill !== undefined) {
            selectedSkills.push(installedSkill);
            continue;
        }

        const targetStates = await Promise.all(
            hostInstallations.map(async (installation) => {
                const installedDirectoryExists = await directoryExists(
                    installation.installedSkillDirectoryPath,
                );
                const metadata = installedDirectoryExists
                    ? await readManagedSkillMetadata(
                            installation.installedSkillDirectoryPath,
                        )
                    : undefined;

                return {
                    ...installation,
                    hasDirectoryWithoutMetadata: installedDirectoryExists
                        && metadata === undefined,
                };
            }),
        );
        const unmanagedTarget = targetStates.find(
            target => target.hasDirectoryWithoutMetadata,
        );

        if (unmanagedTarget !== undefined) {
            throw new CliUserError("errors.skills.update.notManaged", 1, {
                hostName: unmanagedTarget.agentName,
                name: requestedSkillName,
                path: unmanagedTarget.installedSkillDirectoryPath,
            });
        }

        throw new CliUserError("errors.skills.update.notInstalled", 1, {
            name: requestedSkillName,
        });
    }

    return selectedSkills;
}

function groupRegistrySkills(
    skills: readonly ManagedSkillUpdateItem[],
): RegistrySkillGroup[] {
    const groups = new Map<string, ManagedSkillUpdateItem[]>();

    for (const skill of skills) {
        if (skill.metadata?.kind !== "registry") {
            continue;
        }

        const packageName = skill.metadata.packageName;
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
        account: AuthAccount;
        availableHosts: readonly ManagedSkillHost[];
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
        const targetCurrentStates = await Promise.all(
            group.skills.map(skill =>
                isRegistrySkillCurrentInAllHosts(
                    skill.name,
                    packageInfo.packageName,
                    packageInfo.packageVersion,
                    options.availableHosts,
                ),
            ),
        );

        if (targetCurrentStates.every(isCurrent => isCurrent)) {
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

        await Promise.all(
            group.skills.map(skill =>
                validateRegistrySkillPublicationTargets({
                    hostInstallations: resolveManagedSkillHostInstallations(
                        options.availableHosts,
                        skill.name,
                    ),
                    skillName: skill.name,
                }),
            ),
        );

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
                        preparedPublication: await prepareRegistrySkillPublication({
                            extractedPackage,
                            hostInstallations: resolveManagedSkillHostInstallations(
                                options.availableHosts,
                                skill.name,
                            ),
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

async function isRegistrySkillCurrentInAllHosts(
    skillName: string,
    packageName: string,
    packageVersion: string,
    availableHosts: readonly ManagedSkillHost[],
): Promise<boolean> {
    const hostInstallations = resolveManagedSkillHostInstallations(
        availableHosts,
        skillName,
    );
    const targetStates = await Promise.all(
        hostInstallations.map(async (installation) => {
            if (!(await directoryExists(installation.installedSkillDirectoryPath))) {
                return undefined;
            }

            return {
                metadata: await readManagedSkillMetadata(
                    installation.installedSkillDirectoryPath,
                ),
                publicationCurrent: await isManagedSkillPublicationCurrent(
                    installation.installedSkillDirectoryPath,
                ),
            };
        }),
    );

    return targetStates.every(state =>
        state?.metadata?.packageName === packageName
        && state.metadata.version === packageVersion
        && state.publicationCurrent,
    );
}

function normalizeSkillUpdateError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    }

    return new Error(String(error));
}

function writeNonTtyLine(
    context: CliExecutionContext,
    message: string,
): void {
    if (context.stdout.isTTY !== true) {
        writeLine(context.stdout, message);
    }
}

function writeUpdateSuccessLine(
    context: CliExecutionContext,
    skillName: string,
    installationPath: string,
): void {
    writeNonTtyLine(
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
    writeNonTtyLine(
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
    writeNonTtyLine(
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
