import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";
import type { InstalledSkill } from "./installed-skills.ts";
import type { ManagedSkillHost } from "./managed-skill-hosts.ts";
import type {
    SkillOperationError,
    SkillResult,
    SkillTargetResult,
    UpdateReport,
} from "./operation-result.ts";

import type { PreparedRegistrySkillPublication } from "./registry-skill-publication.ts";
import type { SkillDirectoryState } from "./skill-directory-state.ts";
import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { writeLine } from "../shared/output.ts";
import {
    groupInstalledSkillsByPackageName,
    readInstalledSkills,
} from "./installed-skills.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    computeCommandStatus,
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
    tryReportRegistryPackageDownload,
} from "./registry-skill-source.ts";
import { isBundledSkillName } from "./shared.ts";
import {
    isCurrentRegistryPublication,
    managedMetadataOfKind,
    readSkillDirectoryState,
} from "./skill-directory-state.ts";
import {
    normalizeSkillFilterTokens,
    selectSkillsByFilter,
} from "./skill-filter.ts";
import {
    createPackageNamesTelemetryProperties,
    createSkillIdsTelemetryProperties,
} from "./telemetry.ts";
import { SkillsUpdateProgressReporter } from "./update-progress.ts";

interface SkillsUpdateInput {
    packageNames?: string[];
    skill?: string[];
}

const updateErrorMessages: Record<string, string> = {
    not_authenticated: "Authentication is required.",
    no_supported_hosts: "No supported skill host is installed.",
    invalid_path: "Skill name resolves outside the managed skills directory.",
    package_not_installed: "No installed oo-managed skill belongs to the requested package.",
    bundled_unsupported: "Bundled skills cannot be updated with skills update.",
    package_lookup_failed: "Failed to fetch the latest package version.",
    package_download_failed: "Failed to download the package archive.",
    invalid_package_archive: "Downloaded package archive is invalid.",
    publication_failed: "Failed to publish the skill to one or more hosts.",
    skill_filter_no_match: "None of the requested skills are installed.",
    unknown: "Unknown error.",
};

interface RegistrySkillGroup {
    packageName: string;
    skills: InstalledSkill[];
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
            name: "packageNames",
            descriptionKey: "arguments.skills.update.packageName",
            required: false,
            variadic: true,
        },
    ],
    options: [
        {
            name: "skill",
            longFlag: "--skill",
            shortFlag: "-s",
            valueName: "skills...",
            descriptionKey: "options.skills.skill",
        },
    ],
    output: "standard",
    inputSchema: z.object({
        packageNames: z.array(z.string()).optional(),
        skill: z.array(z.string()).optional(),
    }),
    handler: async (input, context) => {
        // Record the skill-filter dimension up front so it is present on every
        // path, including the text no-results early return and the no-match
        // throw, which both happen before the detailed telemetry is recorded.
        // Derive it from the normalized tokens so blank values are not reported
        // as an active filter.
        context.telemetry?.recordProperties({
            has_skill_filter: normalizeSkillFilterTokens(input.skill) !== undefined,
        });

        if (context.output.format === "json") {
            const report = await runUpdateJsonReport(
                { packageNames: input.packageNames ?? [], skillFilter: input.skill },
                context,
            );

            recordUpdateTelemetry(context, report);
            context.output.emitJson(report);

            if (report.status === "partial-failure" || report.status === "failed") {
                throw new CliUserError("errors.skills.update.partialFailure", 1, {
                    count: report.summary.failed + report.errors.length,
                });
            }
            return;
        }

        await updateManagedSkills(
            {
                packageNames: input.packageNames ?? [],
                skillFilter: input.skill,
            },
            context,
        );
    },
};

export async function updateManagedSkills(
    request: {
        packageNames: readonly string[];
        skillFilter?: readonly string[];
    },
    context: CliExecutionContext,
): Promise<void> {
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

    if (availableHosts.length === 0) {
        throw createMissingManagedSkillHostError(context.env);
    }

    const settingsFilePath = context.settingsStore.getFilePath();
    const installedSkills = await readInstalledSkills(context.env, settingsFilePath);
    const selectedByPackage = resolveSelectedManagedSkillsByPackage(
        request.packageNames,
        installedSkills,
    );

    if (selectedByPackage.length === 0) {
        writeLine(context.stdout, context.translator.t("skills.update.noResults"));
        return;
    }

    // The `--skill` filter narrows the resolved skills; unmatched names are
    // ignored, and an error listing the resolved skills is raised when nothing
    // matches.
    const selectedSkills = filterManagedSkillsOrThrow(
        selectedByPackage,
        request.skillFilter,
    );

    const progressReporter = context.stdout.isTTY === true
        ? new SkillsUpdateProgressReporter(
                context.stdout,
                selectedSkills.map(skill => skill.name),
                context.translator,
            )
        : undefined;
    const registrySkillGroups = groupRegistrySkills(selectedSkills);
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
            ? (await requireIdentity(context)).account
            : undefined;
        const phaseOneResults = await Promise.all(
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

// Resolve the requested package names to their installed registry skills.
// The positional arguments are package names: each package contributes every
// installed skill that carries that package identity. When no package name is
// given, every installed managed registry skill is selected. Bundled skill
// names and packages with no installed skill fail fast in text mode.
function resolveSelectedManagedSkillsByPackage(
    requestedPackageNames: readonly string[],
    installedSkills: readonly InstalledSkill[],
): InstalledSkill[] {
    if (requestedPackageNames.length === 0) {
        return installedSkills.filter(
            skill => skill.kind === "registry" && !isBundledSkillName(skill.name),
        );
    }

    const skillsByPackageName = groupInstalledSkillsByPackageName(installedSkills);
    const selectedSkills: InstalledSkill[] = [];
    const seenPackageNames = new Set<string>();

    for (const requestedPackageName of requestedPackageNames) {
        if (seenPackageNames.has(requestedPackageName)) {
            continue;
        }

        seenPackageNames.add(requestedPackageName);

        if (isBundledSkillName(requestedPackageName)) {
            throw new CliUserError(
                "errors.skills.update.bundledUnsupported",
                1,
                {
                    name: requestedPackageName,
                },
            );
        }

        const packageSkills = skillsByPackageName.get(requestedPackageName);

        if (packageSkills === undefined || packageSkills.length === 0) {
            throw new CliUserError("errors.skills.update.packageNotInstalled", 1, {
                packageName: requestedPackageName,
            });
        }

        selectedSkills.push(...packageSkills);
    }

    return selectedSkills;
}

// Narrow resolved managed skills by the optional `--skill` filter. Returns
// every skill when no filter is active, and throws a listing error when the
// filter matches nothing.
function filterManagedSkillsOrThrow(
    skills: readonly InstalledSkill[],
    skillFilter: readonly string[] | undefined,
): InstalledSkill[] {
    const tokens = normalizeSkillFilterTokens(skillFilter);

    if (tokens === undefined) {
        return [...skills];
    }

    const matched = selectSkillsByFilter(skills, tokens);

    if (matched.length === 0) {
        throw new CliUserError("errors.skills.skillFilterNoMatch", 1, {
            skills: skills.map(skill => skill.name).join(", "),
        });
    }

    return matched;
}

function groupRegistrySkills(
    skills: readonly InstalledSkill[],
): RegistrySkillGroup[] {
    return Array.from(
        groupInstalledSkillsByPackageName(skills).entries(),
        ([packageName, groupedSkills]) => ({
            packageName,
            skills: groupedSkills,
        }),
    );
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

        await tryReportRegistryPackageDownload(
            packageInfo.packageName,
            packageInfo.packageVersion,
            options.account,
            context,
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
        hostInstallations.map(installation =>
            readSkillDirectoryState(installation.installedSkillDirectoryPath),
        ),
    );

    return targetStates.every(state =>
        isCurrentRegistryPublication(state, {
            packageName,
            version: packageVersion,
        }),
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
    state: SkillDirectoryState;
}

async function runUpdateJsonReport(
    request: { packageNames: readonly string[]; skillFilter?: readonly string[] },
    context: CliExecutionContext,
): Promise<UpdateReport> {
    const errors: SkillOperationError[] = [];
    const skillFilterTokens = normalizeSkillFilterTokens(request.skillFilter);
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

    if (availableHosts.length === 0) {
        errors.push({
            code: "no_supported_hosts",
            message: updateErrorMessages.no_supported_hosts!,
        });
        return buildUpdateReport([], errors);
    }

    const settingsFilePath = context.settingsStore.getFilePath();
    let installedSkills: InstalledSkill[];

    try {
        installedSkills = await readInstalledSkills(context.env, settingsFilePath);
    }
    catch (error) {
        context.logger.warn({ err: error }, "Update --json failed to list installed skills.");
        errors.push({
            code: "unknown",
            message: updateErrorMessages.unknown!,
        });
        return buildUpdateReport([], errors);
    }

    const requestedPackageNames = request.packageNames;
    const skills: SkillResult[] = [];

    if (requestedPackageNames.length === 0) {
        const selected = installedSkills.filter(skill =>
            skill.kind === "registry" && !isBundledSkillName(skill.name));

        if (selected.length === 0) {
            return buildUpdateReport([], errors);
        }

        const matched = skillFilterTokens === undefined
            ? selected
            : selectSkillsByFilter(selected, skillFilterTokens);

        if (matched.length === 0) {
            errors.push({
                code: "skill_filter_no_match",
                message: updateErrorMessages.skill_filter_no_match!,
            });
            return buildUpdateReport([], errors);
        }
        const results = await runUpdateForSkills(matched, availableHosts, context);

        skills.push(...results);
        return buildUpdateReport(skills, errors);
    }

    const skillsByPackageName = groupInstalledSkillsByPackageName(installedSkills);
    const seenPackageNames = new Set<string>();
    let anyCandidate = false;
    let anyMatched = false;

    for (const packageName of requestedPackageNames) {
        if (seenPackageNames.has(packageName)) {
            continue;
        }
        seenPackageNames.add(packageName);

        if (isBundledSkillName(packageName)) {
            skills.push({
                skillId: packageName,
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

        const packageSkills = skillsByPackageName.get(packageName) ?? [];

        if (packageSkills.length === 0) {
            skills.push({
                skillId: packageName,
                kind: "unknown",
                packageName,
                previousVersion: null,
                version: null,
                status: "failed",
                targets: [],
                error: {
                    code: "package_not_installed",
                    message: updateErrorMessages.package_not_installed!,
                },
            });
            continue;
        }

        anyCandidate = true;

        // The `--skill` filter narrows each package's installed skills; packages
        // with no matching skill contribute nothing and are silently skipped.
        const matched = skillFilterTokens === undefined
            ? packageSkills
            : selectSkillsByFilter(packageSkills, skillFilterTokens);

        if (matched.length === 0) {
            continue;
        }

        anyMatched = true;

        // Each requested package updates all of its matched installed skills together.
        const results = await runUpdateForSkills(matched, availableHosts, context);

        skills.push(...results);
    }

    // Mirror the text path: when a filter was given and excluded every resolved
    // skill, surface a command-level error so the run fails.
    if (skillFilterTokens !== undefined && anyCandidate && !anyMatched) {
        errors.push({
            code: "skill_filter_no_match",
            message: updateErrorMessages.skill_filter_no_match!,
        });
    }

    return buildUpdateReport(skills, errors);
}

async function runUpdateForSkills(
    selectedSkills: readonly InstalledSkill[],
    availableHosts: readonly ManagedSkillHost[],
    context: CliExecutionContext,
): Promise<SkillResult[]> {
    const settingsFilePath = context.settingsStore.getFilePath();
    // selectedSkills are always registry-kind: callers feed either the
    // registry-filtered installed list or per-package groups, so grouping
    // covers every skill and no unresolved remainder is possible.
    const groups = groupRegistrySkills(selectedSkills);

    let account: AuthAccount | undefined;

    if (groups.length > 0) {
        try {
            account = (await requireIdentity(context)).account;
        }
        catch (error) {
            const code = mapUpdateErrorCode(error);
            const message = updateErrorMessages[code] ?? updateErrorMessages.unknown!;

            return selectedSkills.map(skill => ({
                skillId: skill.name,
                kind: "registry",
                packageName: skill.packageName ?? null,
                previousVersion: null,
                version: null,
                status: "failed",
                targets: [],
                error: { code, message },
            }));
        }
    }

    const results: SkillResult[] = [];

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
            installations.map(async installation => ({
                agentName: installation.agentName,
                installedPath: installation.installedSkillDirectoryPath,
                canonicalPath,
                state: await readSkillDirectoryState(
                    installation.installedSkillDirectoryPath,
                ),
            } satisfies HostVersionState)),
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

        return states.length > 0 && states.every(hostState =>
            isCurrentRegistryPublication(hostState.state, {
                packageName: packageInfo.packageName,
                version: latestVersion,
            }),
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

        await tryReportRegistryPackageDownload(
            packageInfo.packageName,
            packageInfo.packageVersion,
            account,
            context,
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
                    const previousVersion = preState === undefined
                        ? null
                        : readRegistryPreviousVersion(preState.state);
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
        const previousVersion = readRegistryPreviousVersion(state.state);

        if (previousVersion !== null) {
            return previousVersion;
        }
    }
    return null;
}

function readRegistryPreviousVersion(state: SkillDirectoryState): string | null {
    return managedMetadataOfKind(state, "registry")?.version ?? null;
}

function buildCurrentTargets(
    preStates: readonly HostVersionState[],
    version: string,
): SkillTargetResult[] {
    return preStates.map((state) => {
        const previousVersion = readRegistryPreviousVersion(state.state);

        return {
            agentId: state.agentName,
            status: "current",
            path: state.installedPath,
            sourcePath: state.canonicalPath,
            version,
            previousVersion,
            previousState: previousVersion === null ? "absent" : "managed",
        };
    });
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
        case "errors.auth.requiredConnectorOnly":
        case "auth.account.activeAccountMissing":
            return "not_authenticated";
        case "errors.skills.update.packageNotInstalled":
            return "package_not_installed";
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
            // Every reported entry corresponds to one requested/resolved skill,
            // including per-skill failures, so the count tracks skills[] length.
            requestedSkills: skills.length,
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
