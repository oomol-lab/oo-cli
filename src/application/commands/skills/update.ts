import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";
import type { ManagedSkillHost } from "./managed-skill-hosts.ts";
import type { ManagedSkillListItem } from "./managed-skill-listings.ts";
import type {
    SkillOperationError,
    SkillResult,
    SkillTargetResult,
    UpdateReport,
} from "./operation-result.ts";

import type { PreparedRegistrySkillPublication } from "./registry-skill-publication.ts";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { writeLine } from "../shared/output.ts";
import {
    directoryExists,
} from "./bundled-skill-observation.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import {
    listManagedSkillInstallations,
    listManagedSkillInstallationsForHosts,
} from "./managed-skill-listings.ts";
import { readManagedSkillMetadata } from "./managed-skill-metadata.ts";
import {
    isManagedSkillPathContained,
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillCanonicalRootDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    isManagedSkillPublicationCurrent,
} from "./managed-skill-publication.ts";
import {
    computeCommandStatus,
    skillOperationOutputOptions,
    writeSkillOperationJson,
} from "./operation-result.ts";
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
    format?: "json";
    showSchemaVersion?: boolean;
}

const updateErrorMessages: Record<string, string> = {
    not_authenticated: "Authentication is required.",
    no_supported_hosts: "No supported skill host is installed.",
    invalid_path: "Skill name resolves outside the managed skills directory.",
    not_installed: "The skill is not installed.",
    not_managed: "The skill directory exists but is not managed by oo.",
    bundled_unsupported: "Bundled skills cannot be updated with skills update.",
    package_lookup_failed: "Failed to fetch the latest package version.",
    package_download_failed: "Failed to download the package archive.",
    invalid_package_archive: "Downloaded package archive is invalid.",
    publication_failed: "Failed to publish the skill to one or more hosts.",
    unknown: "Unknown error.",
};

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
    options: [
        ...skillOperationOutputOptions,
    ],
    inputSchema: z.object({
        skill: z.array(z.string()).optional(),
        format: z.enum(["json"]).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        if (input.format === "json") {
            const report = await runUpdateJsonReport(
                { skillNames: input.skill ?? [] },
                context,
            );

            recordUpdateTelemetry(context, report);
            writeSkillOperationJson(context.stdout, report, {
                showSchemaVersion: input.showSchemaVersion,
            });

            if (report.status === "partial-failure" || report.status === "failed") {
                throw new CliUserError("errors.skills.update.partialFailure", 1, {
                    count: report.summary.failed + report.errors.length,
                });
            }
            return;
        }

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

interface HostVersionState {
    agentName: BundledSkillAgentName;
    installedPath: string;
    canonicalPath: string | null;
    previousPackageName: string | null;
    previousVersion: string | null;
    publicationCurrent: boolean;
}

async function runUpdateJsonReport(
    request: { skillNames: readonly string[] },
    context: CliExecutionContext,
): Promise<UpdateReport> {
    const errors: SkillOperationError[] = [];
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

    if (availableHosts.length === 0) {
        errors.push({
            code: "no_supported_hosts",
            message: updateErrorMessages.no_supported_hosts!,
        });
        return buildUpdateReport([], 0, errors);
    }

    const settingsFilePath = context.settingsStore.getFilePath();
    let installedSkills: ManagedSkillUpdateItem[];

    try {
        installedSkills = await readKnownManagedSkillInstallations(
            availableHosts,
            settingsFilePath,
        );
    }
    catch (error) {
        context.logger.warn({ err: error }, "Update --json failed to list installed skills.");
        errors.push({
            code: "unknown",
            message: updateErrorMessages.unknown!,
        });
        return buildUpdateReport([], 0, errors);
    }

    const requestedSkillNames = request.skillNames;
    const skills: SkillResult[] = [];

    if (requestedSkillNames.length === 0) {
        const selected = installedSkills.filter(skill => !isBundledSkillName(skill.name));

        if (selected.length === 0) {
            return buildUpdateReport([], 0, errors);
        }
        const results = await runUpdateForSkills(selected, availableHosts, context);

        skills.push(...results);
        return buildUpdateReport(skills, selected.length, errors);
    }

    const installedIndex = new Map(
        installedSkills.map(skill => [skill.name, skill] as const),
    );
    const seen = new Set<string>();
    const requested: ManagedSkillUpdateItem[] = [];

    for (const skillName of requestedSkillNames) {
        if (seen.has(skillName)) {
            continue;
        }
        seen.add(skillName);

        if (isBundledSkillName(skillName)) {
            skills.push({
                skillId: skillName,
                kind: "bundled",
                packageName: null,
                previousVersion: null,
                version: null,
                status: "failed",
                targets: [],
                error: {
                    code: "bundled_unsupported",
                    message: updateErrorMessages.bundled_unsupported!,
                },
            });
            continue;
        }

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
            skills.push({
                skillId: skillName,
                kind: "registry",
                packageName: null,
                previousVersion: null,
                version: null,
                status: "failed",
                targets: [],
                error: {
                    code: "invalid_path",
                    message: updateErrorMessages.invalid_path!,
                },
            });
            continue;
        }

        const installed = installedIndex.get(skillName);

        if (installed !== undefined) {
            requested.push(installed);
            continue;
        }

        const statesPerHost = await Promise.all(
            hostInstallations.map(async (installation) => {
                const exists = await directoryExists(installation.installedSkillDirectoryPath);
                const metadata = exists
                    ? await readManagedSkillMetadata(installation.installedSkillDirectoryPath)
                    : undefined;

                return { exists, hasMetadata: metadata !== undefined };
            }),
        );
        const unmanaged = statesPerHost.find(state => state.exists && !state.hasMetadata);

        skills.push({
            skillId: skillName,
            kind: "registry",
            packageName: null,
            previousVersion: null,
            version: null,
            status: "failed",
            targets: [],
            error: {
                code: unmanaged !== undefined ? "not_managed" : "not_installed",
                message: unmanaged !== undefined
                    ? updateErrorMessages.not_managed!
                    : updateErrorMessages.not_installed!,
            },
        });
    }

    if (requested.length === 0) {
        return buildUpdateReport(skills, requestedSkillNames.length, errors);
    }

    const results = await runUpdateForSkills(requested, availableHosts, context);

    skills.push(...results);
    return buildUpdateReport(skills, requestedSkillNames.length, errors);
}

async function runUpdateForSkills(
    selectedSkills: readonly ManagedSkillUpdateItem[],
    availableHosts: readonly ManagedSkillHost[],
    context: CliExecutionContext,
): Promise<SkillResult[]> {
    const settingsFilePath = context.settingsStore.getFilePath();
    const groups = groupRegistrySkills(selectedSkills);
    const unresolvedSkills = selectedSkills.filter(skill =>
        !isBundledSkillName(skill.name) && skill.metadata?.kind !== "registry",
    );

    let account: AuthAccount | undefined;

    if (groups.length > 0) {
        try {
            account = await requireCurrentAccount(context);
        }
        catch (error) {
            const code = mapUpdateErrorCode(error);
            const message = updateErrorMessages[code] ?? updateErrorMessages.unknown!;

            return selectedSkills.map(skill => ({
                skillId: skill.name,
                kind: "registry",
                packageName: skill.metadata?.kind === "registry"
                    ? skill.metadata.packageName
                    : null,
                previousVersion: null,
                version: null,
                status: "failed",
                targets: [],
                error: { code, message },
            }));
        }
    }

    const results: SkillResult[] = [];

    for (const skill of unresolvedSkills) {
        results.push({
            skillId: skill.name,
            kind: "unknown",
            packageName: null,
            previousVersion: null,
            version: null,
            status: "failed",
            targets: [],
            error: {
                code: "unknown",
                message: `Managed skill ${skill.name} cannot be updated: package metadata is missing.`,
            },
        });
    }

    for (const group of groups) {
        const groupResults = await runGroupUpdateJson(
            group,
            availableHosts,
            settingsFilePath,
            account!,
            context,
        );

        results.push(...groupResults);
    }

    return results;
}

async function runGroupUpdateJson(
    group: RegistrySkillGroup,
    availableHosts: readonly ManagedSkillHost[],
    settingsFilePath: string,
    account: AuthAccount,
    context: CliExecutionContext,
): Promise<SkillResult[]> {
    const preStateBySkill = new Map<string, HostVersionState[]>();

    for (const skill of group.skills) {
        const canonicalPath = resolveManagedSkillCanonicalDirectoryPath(
            settingsFilePath,
            skill.name,
        );
        const installations = resolveManagedSkillHostInstallations(availableHosts, skill.name);
        const hostStates = await Promise.all(
            installations.map(async (installation) => {
                const metadata = await readManagedSkillMetadata(
                    installation.installedSkillDirectoryPath,
                );
                const current = await isManagedSkillPublicationCurrent(
                    installation.installedSkillDirectoryPath,
                );

                return {
                    agentName: installation.agentName,
                    installedPath: installation.installedSkillDirectoryPath,
                    canonicalPath,
                    previousPackageName: metadata?.packageName ?? null,
                    previousVersion: metadata?.version ?? null,
                    publicationCurrent: current,
                } satisfies HostVersionState;
            }),
        );

        preStateBySkill.set(skill.name, hostStates);
    }

    let packageInfo;

    try {
        packageInfo = await loadRegistryPackageSkillInfo(
            group.packageName,
            account,
            context,
        );
    }
    catch (error) {
        const code = mapUpdateErrorCode(error);
        const message = updateErrorMessages[code] ?? updateErrorMessages.unknown!;

        context.logger.warn(
            { err: error, packageName: group.packageName },
            "Update --json package-info failed.",
        );

        return group.skills.map(skill => ({
            skillId: skill.name,
            kind: "registry",
            packageName: group.packageName,
            previousVersion: getPreviousVersionForSkill(preStateBySkill, skill.name),
            version: null,
            status: "failed",
            targets: [],
            error: { code, message },
        }));
    }

    const latestVersion = packageInfo.packageVersion;
    const allCurrentStates = group.skills.map((skill) => {
        const states = preStateBySkill.get(skill.name) ?? [];

        return states.length > 0 && states.every(state =>
            state.previousPackageName === packageInfo.packageName
            && state.previousVersion === latestVersion
            && state.publicationCurrent,
        );
    });

    if (allCurrentStates.every(isCurrent => isCurrent)) {
        return group.skills.map(skill => ({
            skillId: skill.name,
            kind: "registry",
            packageName: group.packageName,
            previousVersion: getPreviousVersionForSkill(preStateBySkill, skill.name),
            version: latestVersion,
            status: "current",
            targets: buildCurrentTargets(preStateBySkill.get(skill.name) ?? [], latestVersion),
        }));
    }

    let extractedPackage: Awaited<ReturnType<typeof extractRegistryPackageArchive>>;
    let packageBytes: Uint8Array<ArrayBuffer>;

    try {
        await Promise.all(
            group.skills.map(skill =>
                validateRegistrySkillPublicationTargets({
                    hostInstallations: resolveManagedSkillHostInstallations(
                        availableHosts,
                        skill.name,
                    ),
                    skillName: skill.name,
                }),
            ),
        );

        packageBytes = await downloadRegistryPackageTarball(
            packageInfo.packageName,
            packageInfo.packageVersion,
            account,
            context,
        );
    }
    catch (error) {
        const code = mapUpdateErrorCode(error);
        const message = updateErrorMessages[code] ?? updateErrorMessages.unknown!;

        context.logger.warn(
            { err: error, packageName: group.packageName },
            "Update --json download failed.",
        );

        return group.skills.map(skill => ({
            skillId: skill.name,
            kind: "registry",
            packageName: group.packageName,
            previousVersion: getPreviousVersionForSkill(preStateBySkill, skill.name),
            version: null,
            status: "failed",
            targets: [],
            error: { code, message },
        }));
    }

    try {
        extractedPackage = await extractRegistryPackageArchive(packageBytes);
    }
    catch (error) {
        // Extraction errors signal an unusable tarball; the prior network step succeeded.
        context.logger.warn(
            { err: error, packageName: group.packageName },
            "Update --json archive extract failed.",
        );

        return group.skills.map(skill => ({
            skillId: skill.name,
            kind: "registry",
            packageName: group.packageName,
            previousVersion: getPreviousVersionForSkill(preStateBySkill, skill.name),
            version: null,
            status: "failed",
            targets: [],
            error: {
                code: "invalid_package_archive",
                message: updateErrorMessages.invalid_package_archive!,
            },
        }));
    }

    const results: SkillResult[] = [];

    try {
        for (const skill of group.skills) {
            const hostInstallations = resolveManagedSkillHostInstallations(
                availableHosts,
                skill.name,
            );

            try {
                const prepared = await prepareRegistrySkillPublication({
                    extractedPackage,
                    hostInstallations,
                    packageName: packageInfo.packageName,
                    packageVersion: latestVersion,
                    settingsFilePath,
                    skill: findPackageSkillOrThrow(
                        packageInfo.skills,
                        skill.name,
                        packageInfo.packageName,
                    ),
                    skillName: skill.name,
                });
                const installations = await publishPreparedRegistrySkillPublication(prepared);
                const preStates = preStateBySkill.get(skill.name) ?? [];
                const canonicalPath = preStates[0]?.canonicalPath
                    ?? resolveManagedSkillCanonicalDirectoryPath(settingsFilePath, skill.name);
                const targets: SkillTargetResult[] = installations.map((installation) => {
                    const preState = preStates.find(
                        state => state.agentName === installation.agentName,
                    );
                    const previousVersion = preState?.previousVersion ?? null;
                    const status = previousVersion === latestVersion ? "repaired" : "updated";

                    return {
                        agentId: installation.agentName,
                        status,
                        path: installation.path,
                        sourcePath: canonicalPath,
                        version: latestVersion,
                        previousVersion,
                        previousState: previousVersion === null ? "absent" : "managed",
                    };
                });
                const skillStatus = targets.some(target => target.status === "updated")
                    ? "updated"
                    : "repaired";

                results.push({
                    skillId: skill.name,
                    kind: "registry",
                    packageName: group.packageName,
                    previousVersion: getPreviousVersionForSkill(preStateBySkill, skill.name),
                    version: latestVersion,
                    status: skillStatus,
                    targets,
                });
            }
            catch (error) {
                const code = mapUpdateErrorCode(error);
                const message = updateErrorMessages[code] ?? updateErrorMessages.unknown!;

                context.logger.warn(
                    { err: error, skillName: skill.name },
                    "Update --json publication failed.",
                );

                results.push({
                    skillId: skill.name,
                    kind: "registry",
                    packageName: group.packageName,
                    previousVersion: getPreviousVersionForSkill(preStateBySkill, skill.name),
                    version: null,
                    status: "failed",
                    targets: [],
                    error: { code, message },
                });
            }
        }
    }
    finally {
        await extractedPackage.cleanup();
    }

    return results;
}

function getPreviousVersionForSkill(
    preStateBySkill: Map<string, HostVersionState[]>,
    skillName: string,
): string | null {
    const states = preStateBySkill.get(skillName) ?? [];

    for (const state of states) {
        if (state.previousVersion !== null) {
            return state.previousVersion;
        }
    }
    return null;
}

function buildCurrentTargets(
    preStates: readonly HostVersionState[],
    version: string,
): SkillTargetResult[] {
    return preStates.map(state => ({
        agentId: state.agentName,
        status: "current",
        path: state.installedPath,
        sourcePath: state.canonicalPath,
        version,
        previousVersion: state.previousVersion,
        previousState: state.previousVersion === null ? "absent" : "managed",
    }));
}

function mapUpdateErrorCode(error: unknown): string {
    if (!(error instanceof CliUserError)) {
        return "unknown";
    }
    switch (error.key) {
        case "errors.skills.install.invalidPackageInfo":
        case "errors.skills.install.packageInfoRequestError":
        case "errors.skills.install.packageInfoRequestFailed":
            return "package_lookup_failed";
        case "errors.skills.install.packageDownloadError":
        case "errors.skills.install.packageDownloadFailed":
            return "package_download_failed";
        case "errors.skills.install.invalidArchive":
            return "invalid_package_archive";
        case "errors.skills.invalidPath":
            return "invalid_path";
        case "errors.skills.noSupportedBundledSkillHosts":
            return "no_supported_hosts";
        case "errors.auth.required":
        case "auth.account.activeAccountMissing":
            return "not_authenticated";
        case "errors.skills.update.notManaged":
            return "not_managed";
        case "errors.skills.update.notInstalled":
            return "not_installed";
        case "errors.skills.update.bundledUnsupported":
            return "bundled_unsupported";
        case "errors.skills.nameConflict":
        case "errors.skills.storageConflict":
            return "publication_failed";
        default:
            return "unknown";
    }
}

function buildUpdateReport(
    skills: SkillResult[],
    requestedCount: number,
    commandErrors: SkillOperationError[],
): UpdateReport {
    const updated = skills.filter(skill => skill.status === "updated").length;
    const repaired = skills.filter(skill => skill.status === "repaired").length;
    const current = skills.filter(skill => skill.status === "current").length;
    const failed = skills.filter(skill => skill.status === "failed").length;
    const status = computeCommandStatus({
        succeeded: updated + repaired + current,
        failed,
        commandLevelErrors: commandErrors.length,
        noopWhenEmpty: skills.length === 0 && commandErrors.length === 0,
    });

    return {
        command: "skills.update",
        status,
        summary: {
            requestedSkills: requestedCount,
            updated,
            repaired,
            current,
            failed,
        },
        skills,
        errors: commandErrors,
    };
}

function recordUpdateTelemetry(
    context: CliExecutionContext,
    report: UpdateReport,
): void {
    context.telemetry?.recordProperties({
        format: "json",
        skill_count_bucket: bucketTelemetryCount(report.summary.requestedSkills),
        updated_count_bucket: bucketTelemetryCount(report.summary.updated),
        repaired_count_bucket: bucketTelemetryCount(report.summary.repaired),
        current_count_bucket: bucketTelemetryCount(report.summary.current),
        failed_count_bucket: bucketTelemetryCount(report.summary.failed),
    });
}
