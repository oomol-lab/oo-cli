import type {
    CliCommandDefinition,
    CliExecutionContext,
} from "../../contracts/cli.ts";
import type { BundledSkillName } from "./embedded-assets.ts";

import type { ManagedSkillInstallSummary } from "./install-output.ts";
import type {
    InstallReport,
    PreviousState,
    SkillOperationError,
    SkillResult,
    SkillTargetResult,
} from "./operation-result.ts";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { parsePackageSpecifier } from "../shared/package-info.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import { writeManagedSkillInstallSummary } from "./install-output.ts";
import { migrateLegacyCanonicalSkillLayout } from "./legacy-canonical-migration.ts";
import { readSkillMetadataFileState } from "./local-skill-ownership.ts";
import { readManagedSkillMetadata } from "./managed-skill-metadata.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    computeCommandStatus,
    skillOperationOutputOptions,
    writeSkillOperationJson,
} from "./operation-result.ts";
import { installRegistrySkills } from "./registry-skill-install.ts";
import {
    installBundledSkill,
    isBundledSkillName,
    resolveAvailableBundledSkillHostInstallations,
} from "./shared.ts";
import {
    normalizeSkillFilterTokens,
    skillMatchesFilterTokens,
} from "./skill-filter.ts";
import {
    createPackageNamesTelemetryProperties,
    createSkillIdsTelemetryProperties,
} from "./telemetry.ts";

interface SkillsInstallInput {
    force?: boolean;
    packageNames?: string[];
    skill?: string[];
    format?: "json";
    showSchemaVersion?: boolean;
}

type SkillsInstallPackageKind = "bundled" | "registry";

interface ClassifiedSkillsInstallTarget {
    kind: SkillsInstallPackageKind;
    specifier: SkillsInstallPackageSpecifier;
}

interface SkillsInstallPackageSpecifier {
    hasExplicitPackageVersion: boolean;
    packageName: string;
    packageShareId?: string;
    packageVersion: string;
}

const installErrorMessages: Record<string, string> = {
    not_authenticated: "Authentication is required.",
    no_supported_hosts: "No supported skill host is installed.",
    invalid_path: "Skill name resolves outside the managed skills directory.",
    invalid_package_specifier: "Invalid skills package specifier.",
    package_lookup_failed: "Failed to fetch the latest package version.",
    package_download_failed: "Failed to download the package archive.",
    invalid_package_archive: "Downloaded package archive is invalid.",
    skill_not_found_in_package: "The skill was not found in the requested package.",
    name_conflict: "Skill name is already used by a non-OOMOL skill.",
    storage_conflict: "Bundled skill storage is already occupied by non-OOMOL content.",
    publication_failed: "Failed to publish the skill to one or more hosts.",
    skill_filter_no_match: "None of the requested skills exist in the requested packages.",
    unknown: "Unknown error.",
};

export const skillsInstallCommand: CliCommandDefinition<SkillsInstallInput> = {
    name: "install",
    aliases: ["add"],
    summaryKey: "commands.skills.install.summary",
    descriptionKey: "commands.skills.install.description",
    arguments: [
        {
            name: "packageNames",
            descriptionKey: "arguments.packageName",
            required: false,
            variadic: true,
        },
    ],
    options: [
        {
            name: "force",
            longFlag: "--force",
            shortFlag: "-f",
            descriptionKey: "options.skills.install.force",
        },
        {
            name: "skill",
            longFlag: "--skill",
            shortFlag: "-s",
            valueName: "skills...",
            descriptionKey: "options.skills.skill",
        },
        ...skillOperationOutputOptions,
    ],
    inputSchema: z.object({
        force: z.boolean().optional(),
        packageNames: z.array(z.string()).optional(),
        skill: z.array(z.string()).optional(),
        format: z.enum(["json"]).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        await migrateLegacyCanonicalSkillLayout(context);

        const force = input.force === true;
        // Derive the filter flag from the normalized tokens so blank/whitespace
        // values (which collapse away) are not reported as an active filter.
        const skillFilterActive = normalizeSkillFilterTokens(input.skill) !== undefined;
        // Record the skill-filter dimension up front so it is present on every
        // path, including when a no-match check throws before the detailed
        // telemetry is recorded.
        context.telemetry?.recordProperties({
            has_skill_filter: skillFilterActive,
        });

        if (input.format === "json") {
            const report = await runInstallJsonReport(input, context, { force });

            recordInstallTelemetry(context, report, force);
            writeSkillOperationJson(context.stdout, report, {
                showSchemaVersion: input.showSchemaVersion,
            });

            if (report.status === "partial-failure" || report.status === "failed") {
                throw new CliUserError("errors.skills.install.partialFailure", 1, {
                    count: report.summary.failed + report.errors.length,
                });
            }
            return;
        }

        const packageNames = input.packageNames ?? [];

        if (packageNames.length === 0) {
            // No package argument installs the bundled skills, narrowed by the
            // optional `--skill` filter.
            const selectedBundled = selectBundledSkillNamesOrThrow(input.skill);

            context.telemetry?.recordProperties({
                bundled_skill: "__all__",
                has_bundled_skill: true,
                has_force: force,
                has_registry_skill: false,
                package_kind: "bundled",
                ...createSkillIdsTelemetryProperties(selectedBundled),
                ...createPackageNamesTelemetryProperties([]),
            });

            const summaries: ManagedSkillInstallSummary[] = [];

            for (const skillName of selectedBundled) {
                summaries.push(await installBundledSkill(skillName, context, { force }));
            }

            writeManagedSkillInstallSummary(context, summaries);
            return;
        }

        // Parse every specifier up front so a malformed package name fails the
        // whole command before any install side effects are written.
        const targets = packageNames.map(classifySkillsInstallTarget);

        recordInstallBaseTelemetry(context, targets, force);

        const installedSkillIds: string[] = [];
        const registryFilterMatch = new RegistrySkillFilterMatchTracker();

        for (const target of targets) {
            if (target.kind === "bundled") {
                // An explicitly named bundled skill is already a single-skill
                // selection, so `--skill` does not further narrow it.
                const summary = await installBundledSkill(
                    target.specifier.packageName as BundledSkillName,
                    context,
                    { force },
                );

                writeManagedSkillInstallSummary(context, [summary]);
                installedSkillIds.push(target.specifier.packageName);
            }
            else {
                const summaries = await installRegistrySkills(
                    {
                        force,
                        packageName: target.specifier.packageName,
                        packageShareId: target.specifier.packageShareId,
                        packageVersion: target.specifier.packageVersion,
                        recordTelemetry: false,
                        skillFilter: input.skill,
                        // Across several packages the filter must not fail a
                        // package that simply does not publish a requested skill;
                        // record the miss and decide globally after the loop.
                        reportSkillFilterMiss: names => registryFilterMatch.recordMiss(names),
                        // The command installs all published skills unless the
                        // `--skill` filter narrows them; `skillNames` is reserved
                        // for the explicit `oo skills sync` selection.
                        skillNames: [],
                    },
                    context,
                );

                if (summaries.length > 0) {
                    registryFilterMatch.recordMatch();
                }
                installedSkillIds.push(...summaries.map(summary => summary.name));
            }

            // Re-record cumulatively so installed skill ids survive even when a
            // later package in the list throws.
            context.telemetry?.recordProperties(
                createSkillIdsTelemetryProperties(installedSkillIds),
            );
        }

        // With a `--skill` filter, fail only when nothing was installed at all:
        // per-package registry misses are silently skipped, and an explicitly
        // named bundled skill (which `--skill` never narrows) keeps the command
        // successful even when no registry package matched.
        if (
            skillFilterActive
            && registryFilterMatch.isGlobalMiss()
            && installedSkillIds.length === 0
        ) {
            throw new CliUserError("errors.skills.skillFilterNoMatch", 1, {
                skills: registryFilterMatch.availableSkillsList(),
            });
        }
    },
};

// Tracks, across the registry packages of a single install run, whether the
// `--skill` filter matched at least one published skill and which skills were
// available in the packages that matched nothing. A global miss is when the
// filter was applied to at least one package (so some skills were available) yet
// nothing matched; packages that failed to load contribute neither and are
// reported through their own errors.
class RegistrySkillFilterMatchTracker {
    private matched = false;
    private readonly missedAvailableSkills = new Set<string>();

    recordMatch(): void {
        this.matched = true;
    }

    recordMiss(availableSkillNames: readonly string[]): void {
        for (const name of availableSkillNames) {
            this.missedAvailableSkills.add(name);
        }
    }

    isGlobalMiss(): boolean {
        return !this.matched && this.missedAvailableSkills.size > 0;
    }

    availableSkillsList(): string {
        return [...this.missedAvailableSkills].join(", ");
    }
}

function classifySkillsInstallTarget(
    rawPackageName: string,
): ClassifiedSkillsInstallTarget {
    const specifier = parseSkillsInstallPackageSpecifier(rawPackageName);

    return {
        kind: resolveSkillsInstallPackageKind(specifier),
        specifier,
    };
}

function resolveSkillsInstallPackageKind(
    specifier: SkillsInstallPackageSpecifier,
): SkillsInstallPackageKind {
    if (
        specifier.packageShareId === undefined
        && !specifier.hasExplicitPackageVersion
        && isBundledSkillName(specifier.packageName)
    ) {
        return "bundled";
    }

    return "registry";
}

function recordInstallBaseTelemetry(
    context: CliExecutionContext,
    targets: readonly ClassifiedSkillsInstallTarget[],
    force: boolean,
): void {
    const bundledSkillNames = [
        ...new Set(
            targets
                .filter(target => target.kind === "bundled")
                .map(target => target.specifier.packageName),
        ),
    ];
    const registryPackageNames = [
        ...new Set(
            targets
                .filter(target => target.kind === "registry")
                .map(target => target.specifier.packageName),
        ),
    ];
    const hasBundled = bundledSkillNames.length > 0;
    const hasRegistry = registryPackageNames.length > 0;

    context.telemetry?.recordProperties({
        has_bundled_skill: hasBundled,
        has_force: force,
        has_registry_skill: hasRegistry,
        package_kind: resolveInstallPackageKindLabel(hasBundled, hasRegistry),
        ...createPackageNamesTelemetryProperties(registryPackageNames),
    });

    if (registryPackageNames.length === 1) {
        context.telemetry?.recordProperties({
            package_name: registryPackageNames[0]!,
        });
    }

    if (hasBundled && !hasRegistry && bundledSkillNames.length === 1) {
        context.telemetry?.recordProperties({
            bundled_skill: bundledSkillNames[0]!,
        });
    }
}

function resolveInstallPackageKindLabel(
    hasBundled: boolean,
    hasRegistry: boolean,
): string {
    if (hasBundled && hasRegistry) {
        return "mixed";
    }

    return hasRegistry ? "registry" : "bundled";
}

// Narrow the bundled skill set installed by the no-argument form using the
// optional `--skill` filter. Returns every bundled skill when no filter is
// active, and throws a listing error when the filter matches nothing.
function selectBundledSkillNamesOrThrow(
    skillFilter: readonly string[] | undefined,
): readonly BundledSkillName[] {
    const tokens = normalizeSkillFilterTokens(skillFilter);

    if (tokens === undefined) {
        return availableBundledSkillNames;
    }

    const selected = availableBundledSkillNames.filter(name =>
        skillMatchesFilterTokens({ name }, tokens),
    );

    if (selected.length === 0) {
        throw new CliUserError("errors.skills.skillFilterNoMatch", 1, {
            skills: availableBundledSkillNames.join(", "),
        });
    }

    return selected;
}

async function runInstallJsonReport(
    input: SkillsInstallInput,
    context: CliExecutionContext,
    options: { force: boolean },
): Promise<InstallReport> {
    const skills: SkillResult[] = [];
    const errors: SkillOperationError[] = [];

    const packageNames = input.packageNames ?? [];

    if (packageNames.length === 0) {
        const skillFilterTokens = normalizeSkillFilterTokens(input.skill);
        const selectedBundled = skillFilterTokens === undefined
            ? availableBundledSkillNames
            : availableBundledSkillNames.filter(name =>
                    skillMatchesFilterTokens({ name }, skillFilterTokens),
                );

        if (skillFilterTokens !== undefined && selectedBundled.length === 0) {
            errors.push({
                code: "skill_filter_no_match",
                message: installErrorMessages.skill_filter_no_match!,
            });

            return buildReport(skills, errors, 0);
        }

        for (const bundledName of selectedBundled) {
            const result = await installBundledSkillForJson(
                bundledName,
                context,
                { force: options.force },
            );

            skills.push(result);
        }

        return buildReport(skills, errors, skills.length);
    }

    let requested = 0;
    const skillFilterActive = normalizeSkillFilterTokens(input.skill) !== undefined;
    const registryFilterMatch = new RegistrySkillFilterMatchTracker();

    for (const rawPackageName of packageNames) {
        let packageSpecifier: SkillsInstallPackageSpecifier;

        try {
            packageSpecifier = parseSkillsInstallPackageSpecifier(rawPackageName);
        }
        catch (error) {
            errors.push({
                code: "invalid_package_specifier",
                message: installErrorMessages.invalid_package_specifier!,
            });
            context.logger.warn({ err: error }, "Install --json invalid package specifier.");
            continue;
        }

        if (
            packageSpecifier.packageShareId === undefined
            && !packageSpecifier.hasExplicitPackageVersion
            && isBundledSkillName(packageSpecifier.packageName)
        ) {
            skills.push(await installBundledSkillForJson(
                packageSpecifier.packageName as BundledSkillName,
                context,
                { force: options.force },
            ));
            requested += 1;
            continue;
        }

        requested += await appendRegistryInstallJsonResults(
            packageSpecifier,
            context,
            { force: options.force, skillFilter: input.skill },
            skills,
            errors,
            registryFilterMatch,
        );
    }

    // With a `--skill` filter, fail only when nothing was installed at all:
    // per-package registry misses are silently skipped, and an explicitly named
    // bundled skill (which `--skill` never narrows) keeps the command successful
    // even when no registry package matched.
    if (
        skillFilterActive
        && registryFilterMatch.isGlobalMiss()
        && !skills.some(skill => skill.status === "installed")
    ) {
        errors.push({
            code: "skill_filter_no_match",
            message: installErrorMessages.skill_filter_no_match!,
        });
    }

    return buildReport(skills, errors, requested);
}

async function appendRegistryInstallJsonResults(
    packageSpecifier: SkillsInstallPackageSpecifier,
    context: CliExecutionContext,
    options: { force: boolean; skillFilter?: readonly string[] },
    skills: SkillResult[],
    errors: SkillOperationError[],
    filterMatch: RegistrySkillFilterMatchTracker,
): Promise<number> {
    try {
        const summaries = await installRegistrySkills(
            {
                force: options.force,
                packageName: packageSpecifier.packageName,
                packageShareId: packageSpecifier.packageShareId,
                packageVersion: packageSpecifier.packageVersion,
                recordTelemetry: false,
                skillFilter: options.skillFilter,
                reportSkillFilterMiss: names => filterMatch.recordMiss(names),
                skillNames: [],
                writeOutput: false,
            },
            context,
        );
        const settingsFilePath = context.settingsStore.getFilePath();

        for (const summary of summaries) {
            skills.push(await buildRegistrySkillResult(
                summary,
                packageSpecifier.packageName,
                undefined,
                settingsFilePath,
            ));
        }

        if (summaries.length > 0) {
            filterMatch.recordMatch();
        }

        return summaries.length;
    }
    catch (error) {
        const errorCode = mapInstallErrorCode(error);

        errors.push({
            code: errorCode,
            message: installErrorMessages[errorCode] ?? installErrorMessages.unknown!,
        });
        context.logger.warn(
            { err: error, packageName: packageSpecifier.packageName },
            "Install --json registry install failed.",
        );

        return 0;
    }
}

async function installBundledSkillForJson(
    skillName: BundledSkillName,
    context: CliExecutionContext,
    options: { force: boolean },
): Promise<SkillResult> {
    const installations = await resolveAvailableBundledSkillHostInstallations(
        context,
        skillName,
    );
    const previousStates = await Promise.all(
        installations.map(installation => resolvePreviousState(
            installation.installedSkillDirectoryPath,
        )),
    );

    try {
        const summary = await installBundledSkill(skillName, context, {
            force: options.force,
        });
        const targets: SkillTargetResult[] = summary.publications.map((publication, index) => ({
            agentId: publication.agentName,
            status: "installed",
            path: publication.path,
            sourcePath: installations[index]?.canonicalSkillDirectoryPath ?? null,
            version: context.version,
            previousState: previousStates[index] ?? "unknown",
        }));

        return {
            skillId: skillName,
            kind: "bundled",
            packageName: null,
            previousVersion: null,
            version: context.version,
            status: "installed",
            targets,
        };
    }
    catch (error) {
        const code = mapInstallErrorCode(error);
        const message = installErrorMessages[code] ?? installErrorMessages.unknown!;

        context.logger.warn(
            { err: error, skillName },
            "Bundled skill install failed (JSON path).",
        );

        return {
            skillId: skillName,
            kind: "bundled",
            packageName: null,
            previousVersion: null,
            version: context.version,
            status: "failed",
            targets: [],
            error: { code, message },
        };
    }
}

async function buildRegistrySkillResult(
    summary: ManagedSkillInstallSummary,
    packageName: string,
    previousState: PreviousState | undefined,
    settingsFilePath: string,
): Promise<SkillResult> {
    const canonicalDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        settingsFilePath,
        summary.name,
    );
    const canonicalMetadata = await readManagedSkillMetadata(canonicalDirectoryPath);
    const version = canonicalMetadata?.version ?? null;
    const resolvedPackageName = canonicalMetadata?.packageName ?? packageName;

    return {
        skillId: summary.name,
        kind: "registry",
        packageName: resolvedPackageName,
        previousVersion: null,
        version,
        status: "installed",
        targets: summary.publications.map(publication => ({
            agentId: publication.agentName,
            status: "installed",
            path: publication.path,
            sourcePath: canonicalDirectoryPath,
            version,
            previousState: previousState ?? "unknown",
        })),
    };
}

async function resolvePreviousState(installedDirectoryPath: string): Promise<PreviousState> {
    if (!(await directoryExists(installedDirectoryPath))) {
        return "absent";
    }
    const state = await readSkillMetadataFileState(installedDirectoryPath);

    if (state.metadata === undefined) {
        return "unmanaged";
    }
    return "managed";
}

function mapInstallErrorCode(error: unknown): string {
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
        case "errors.skills.install.skillNotFound":
        case "errors.skills.install.noPublishedSkills":
            return "skill_not_found_in_package";
        case "errors.skills.invalidPath":
            return "invalid_path";
        case "errors.skills.noSupportedBundledSkillHosts":
            return "no_supported_hosts";
        case "errors.auth.required":
        case "auth.account.activeAccountMissing":
            return "not_authenticated";
        case "errors.skills.nameConflict":
            return "name_conflict";
        case "errors.skills.storageConflict":
            return "storage_conflict";
        case "errors.skills.install.invalidPackageSpecifier":
            return "invalid_package_specifier";
        case "errors.skills.skillFilterNoMatch":
            return "skill_filter_no_match";
        default:
            return "unknown";
    }
}

function buildReport(
    skills: SkillResult[],
    commandErrors: SkillOperationError[],
    requested: number,
): InstallReport {
    const installed = skills.filter(skill => skill.status === "installed").length;
    const skipped = skills.filter(skill => skill.status === "skipped").length;
    const failed = skills.filter(skill => skill.status === "failed").length;
    const status = computeCommandStatus({
        succeeded: installed,
        failed,
        commandLevelErrors: commandErrors.length,
        noopWhenEmpty: skills.length === 0 && commandErrors.length === 0,
    });

    return {
        command: "skills.install",
        status,
        summary: {
            requestedSkills: requested,
            installed,
            skipped,
            failed,
        },
        skills,
        errors: commandErrors,
    };
}

function recordInstallTelemetry(
    context: CliExecutionContext,
    report: InstallReport,
    force: boolean,
): void {
    const hasBundled = report.skills.some(skill => skill.kind === "bundled");
    const hasRegistry = report.skills.some(skill => skill.kind === "registry");
    const registryPackageNames = [
        ...new Set(
            report.skills
                .filter(skill => skill.kind === "registry" && skill.packageName !== null)
                .map(skill => skill.packageName as string),
        ),
    ];

    context.telemetry?.recordProperties({
        format: "json",
        has_force: force,
        skill_count_bucket: bucketTelemetryCount(report.summary.requestedSkills),
        installed_count_bucket: bucketTelemetryCount(report.summary.installed),
        failed_count_bucket: bucketTelemetryCount(report.summary.failed),
        has_bundled_skill: hasBundled,
        has_registry_skill: hasRegistry,
        ...(hasBundled || hasRegistry
            ? { package_kind: resolveInstallPackageKindLabel(hasBundled, hasRegistry) }
            : {}),
        ...createPackageNamesTelemetryProperties(registryPackageNames),
    });
}

function parseSkillsInstallPackageSpecifier(
    packageSpecifier: string,
): SkillsInstallPackageSpecifier {
    const trimmedSpecifier = packageSpecifier.trim();

    if (trimmedSpecifier === "") {
        throw new CliUserError("errors.skills.install.invalidPackageSpecifier", 2, {
            value: packageSpecifier,
        });
    }

    const shareSeparatorIndex = trimmedSpecifier.indexOf("#");

    if (shareSeparatorIndex < 0) {
        return parseSkillsInstallPackageIdentity(trimmedSpecifier);
    }

    const packageIdentity = trimmedSpecifier.slice(0, shareSeparatorIndex).trim();
    const packageShareId = trimmedSpecifier.slice(shareSeparatorIndex + 1).trim();

    if (
        packageIdentity === ""
        || packageShareId === ""
        || packageShareId.includes("#")
    ) {
        throw new CliUserError("errors.skills.install.invalidPackageSpecifier", 2, {
            value: packageSpecifier,
        });
    }

    return {
        ...parseSkillsInstallPackageIdentity(packageIdentity),
        packageShareId,
    };
}

function parseSkillsInstallPackageIdentity(
    packageIdentity: string,
): Omit<SkillsInstallPackageSpecifier, "packageShareId"> {
    const packageSpecifier = parsePackageSpecifier(packageIdentity, {
        errorKey: "errors.skills.install.invalidPackageSpecifier",
    });

    return {
        hasExplicitPackageVersion: packageIdentity !== packageSpecifier.packageName,
        packageName: packageSpecifier.packageName,
        packageVersion: packageSpecifier.packageVersion,
    };
}
