import type {
    CliCommandDefinition,
    CliExecutionContext,
} from "../../contracts/cli.ts";
import type { BundledSkillAgentName, BundledSkillName } from "./embedded-assets.ts";

import type { ManagedSkillInstallSummary } from "./install-output.ts";
import type {
    ExportReport,
    InstallReport,
    PreviousState,
    SkillExportResult,
    SkillOperationError,
    SkillResult,
    SkillTargetResult,
} from "./operation-result.ts";
import { join, resolve } from "node:path";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { parsePackageSpecifier } from "../shared/package-info.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
import {
    availableBundledSkillNames,
    materializeBundledSkillToDirectory,
} from "./embedded-assets.ts";
import {
    writeManagedSkillInstallSummary,
    writeSkillExportSummary,
} from "./install-output.ts";
import { migrateLegacyCanonicalSkillLayout } from "./legacy-canonical-migration.ts";
import { readSkillMetadataFileState } from "./local-skill-ownership.ts";
import { parseAgentFormatOption } from "./managed-skill-agents.ts";
import { readManagedSkillMetadata } from "./managed-skill-metadata.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    computeCommandStatus,
    skillOperationOutputOptions,
    writeSkillOperationJson,
} from "./operation-result.ts";
import { exportRegistrySkills } from "./registry-skill-export.ts";
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
    outDir?: string;
    agentFormat?: string;
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
        {
            name: "outDir",
            longFlag: "--out-dir",
            valueName: "dir",
            descriptionKey: "options.skills.install.outDir",
        },
        {
            name: "agentFormat",
            longFlag: "--agent-format",
            valueName: "agent",
            descriptionKey: "options.skills.install.agentFormat",
        },
        ...skillOperationOutputOptions,
    ],
    inputSchema: z.object({
        force: z.boolean().optional(),
        packageNames: z.array(z.string()).optional(),
        skill: z.array(z.string()).optional(),
        outDir: z.string().optional(),
        agentFormat: z.string().optional(),
        format: z.enum(["json"]).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        // `--agent-format` only shapes the `--out-dir` export; on the normal
        // install path it would be ignored, so reject the combination loudly
        // instead of silently doing nothing.
        if (input.agentFormat !== undefined && input.outDir === undefined) {
            throw new CliUserError(
                "errors.skills.install.agentFormatRequiresOutDir",
                2,
            );
        }

        // `--out-dir` switches to a pure export: it writes only inside the
        // requested directory, with no app-data canonical storage, host
        // detection, or legacy migration. Bundled skills are materialized
        // offline; registry packages are downloaded and extracted into the same
        // directory without any oo-managed marker.
        if (input.outDir !== undefined) {
            await runSkillExport(input, context);
            return;
        }

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
    const selection = resolveBundledSkillSelection(skillFilter);

    if (selection.filterMissed) {
        throw new CliUserError("errors.skills.skillFilterNoMatch", 1, {
            skills: availableBundledSkillNames.join(", "),
        });
    }

    return selection.skills;
}

// Resolve the bundled skills selected by the optional `--skill` filter without
// throwing. `filterMissed` is true only when a filter was active yet matched no
// bundled skill, letting callers either throw (text mode) or report a structured
// error (JSON mode).
function resolveBundledSkillSelection(
    skillFilter: readonly string[] | undefined,
): { filterMissed: boolean; skills: readonly BundledSkillName[] } {
    const tokens = normalizeSkillFilterTokens(skillFilter);

    if (tokens === undefined) {
        return { filterMissed: false, skills: availableBundledSkillNames };
    }

    const skills = availableBundledSkillNames.filter(name =>
        skillMatchesFilterTokens({ name }, tokens),
    );

    return { filterMissed: skills.length === 0, skills };
}

// Export bundled and registry skills into an arbitrary directory. Pure with
// respect to oo state: it never writes to the app-data canonical storage or any
// agent home, and writes no `.oo-metadata.json` marker. Bundled skills are
// materialized offline and rendered for the requested `--agent-format`; registry
// packages are downloaded, extracted, and written in their published form.
async function runSkillExport(
    input: SkillsInstallInput,
    context: CliExecutionContext,
): Promise<void> {
    // Reject a blank `--out-dir` before resolving: `resolve("")` would silently
    // fall back to the working directory and the per-skill removePath/cp would
    // then clobber a same-named directory there.
    if (input.outDir!.trim() === "") {
        throw new CliUserError("errors.skills.install.invalidOutDir", 2);
    }

    // Resolve a relative `--out-dir` against the invocation cwd (not the process
    // cwd) so embedded hosts that override the working directory behave like the
    // file download command.
    const outputDirectoryPath = resolve(context.cwd, input.outDir!);
    const agentName = parseAgentFormatOption(
        input.agentFormat,
        "errors.skills.install.invalidAgentFormat",
    );
    const skillFilterActive = normalizeSkillFilterTokens(input.skill) !== undefined;
    const wantJson = input.format === "json";
    const packageNames = input.packageNames ?? [];

    // Parse every specifier up front so a malformed package name fails the whole
    // command before any export side effects are written.
    const targets = packageNames.map(classifySkillsInstallTarget);

    recordExportBaseTelemetry(context, {
        agentName,
        skillFilterActive,
        targets,
    });

    const exports: SkillExportResult[] = [];
    const errors: SkillOperationError[] = [];
    const registryFilterMatch = new RegistrySkillFilterMatchTracker();

    if (packageNames.length === 0) {
        // No package argument exports the bundled skills, narrowed by the
        // optional `--skill` filter.
        const selection = resolveBundledSkillSelection(input.skill);

        if (selection.filterMissed) {
            reportExportSkillFilterMiss(
                wantJson,
                errors,
                availableBundledSkillNames.join(", "),
            );
        }
        else {
            for (const skillName of selection.skills) {
                await runGuardedExportStep(wantJson, errors, context, undefined, async () => {
                    exports.push(await exportBundledSkill(
                        skillName,
                        agentName,
                        outputDirectoryPath,
                        context,
                    ));
                });
            }
        }
    }
    else {
        for (const target of targets) {
            if (target.kind === "bundled") {
                // An explicitly named bundled skill is already a single-skill
                // selection, so `--skill` does not further narrow it.
                await runGuardedExportStep(wantJson, errors, context, undefined, async () => {
                    exports.push(await exportBundledSkill(
                        target.specifier.packageName as BundledSkillName,
                        agentName,
                        outputDirectoryPath,
                        context,
                    ));
                });
                continue;
            }

            await runGuardedExportStep(
                wantJson,
                errors,
                context,
                target.specifier.packageName,
                () => exportRegistryPackageSkills(
                    target.specifier,
                    { exports, input, outputDirectoryPath, registryFilterMatch },
                    context,
                ),
            );
        }

        // With a `--skill` filter, fail only when nothing was exported at all:
        // per-package registry misses are silently skipped, and an explicitly
        // named bundled skill (which `--skill` never narrows) keeps the command
        // successful even when no registry package matched.
        if (
            skillFilterActive
            && registryFilterMatch.isGlobalMiss()
            && exports.length === 0
        ) {
            reportExportSkillFilterMiss(
                wantJson,
                errors,
                registryFilterMatch.availableSkillsList(),
            );
        }
    }

    context.telemetry?.recordProperties({
        skill_count_bucket: bucketTelemetryCount(exports.length),
        ...createSkillIdsTelemetryProperties(exports.map(result => result.skillId)),
    });

    if (wantJson) {
        const report = buildExportReport(
            exports,
            errors,
            agentName,
            outputDirectoryPath,
        );

        writeSkillOperationJson(context.stdout, report, {
            showSchemaVersion: input.showSchemaVersion,
        });

        if (report.status === "partial-failure" || report.status === "failed") {
            throw new CliUserError("errors.skills.install.partialFailure", 1, {
                count: errors.length,
            });
        }
        return;
    }

    writeSkillExportSummary(context, {
        agentName,
        exports,
        outputDirectoryPath,
    });
}

// Materialize one bundled skill into `<outputDirectoryPath>/<skillName>` and
// return the structured export result.
async function exportBundledSkill(
    skillName: BundledSkillName,
    agentName: BundledSkillAgentName,
    outputDirectoryPath: string,
    context: CliExecutionContext,
): Promise<SkillExportResult> {
    const targetSkillDirectoryPath = join(outputDirectoryPath, skillName);
    const files = await materializeBundledSkillToDirectory({
        agentName,
        skillName,
        targetSkillDirectoryPath,
    });

    context.logger.info(
        {
            agentName,
            path: targetSkillDirectoryPath,
            skillName,
        },
        "Bundled skill exported to directory.",
    );

    return {
        skillId: skillName,
        kind: "bundled",
        packageName: null,
        status: "exported",
        path: targetSkillDirectoryPath,
        files: [...files],
    };
}

// Download and export one registry package's selected skills, appending each
// written skill to `exports`. Throws on download/lookup failure, or after a
// per-skill failure once the skills that did succeed are recorded; the caller's
// guard decides whether to propagate (text mode) or collect into `errors[]`.
async function exportRegistryPackageSkills(
    specifier: SkillsInstallPackageSpecifier,
    state: {
        exports: SkillExportResult[];
        input: SkillsInstallInput;
        outputDirectoryPath: string;
        registryFilterMatch: RegistrySkillFilterMatchTracker;
    },
    context: CliExecutionContext,
): Promise<void> {
    const { exported, failures } = await exportRegistrySkills(
        {
            outputDirectoryPath: state.outputDirectoryPath,
            packageName: specifier.packageName,
            packageShareId: specifier.packageShareId,
            packageVersion: specifier.packageVersion,
            reportSkillFilterMiss: names =>
                state.registryFilterMatch.recordMiss(names),
            skillFilter: state.input.skill,
        },
        context,
    );

    // A package that produced any export attempt matched the `--skill` filter,
    // even if some of its skills then failed; record the match so a per-package
    // failure is not misreported as a global filter miss.
    if (exported.length + failures.length > 0) {
        state.registryFilterMatch.recordMatch();
    }

    for (const result of exported) {
        state.exports.push({
            skillId: result.skillName,
            kind: "registry",
            packageName: result.packageName,
            status: "exported",
            path: result.targetSkillDirectoryPath,
            files: result.files,
        });
    }

    // Surface the first per-skill failure only after the successful exports are
    // recorded, so the package-level error still drives the exit code while the
    // skills written before it remain in the report and on disk.
    if (failures.length > 0) {
        throw failures[0]!.error;
    }
}

// Run one export step (bundled or registry). In JSON mode a failure is captured
// into `errors` so the structured report still drives the exit code (mirroring
// the install JSON path); in text mode it propagates so the CLI renders it,
// keeping earlier exports on disk.
async function runGuardedExportStep(
    wantJson: boolean,
    errors: SkillOperationError[],
    context: CliExecutionContext,
    packageName: string | undefined,
    run: () => Promise<void>,
): Promise<void> {
    if (!wantJson) {
        await run();
        return;
    }

    try {
        await run();
    }
    catch (error) {
        const code = mapInstallErrorCode(error);

        errors.push({
            code,
            message: installErrorMessages[code] ?? installErrorMessages.unknown!,
        });
        context.logger.warn(
            { err: error, ...(packageName === undefined ? {} : { packageName }) },
            "Skills export step failed.",
        );
    }
}

// Surface a `--skill` filter miss: throw in text mode, or record a structured
// `skill_filter_no_match` error in JSON mode so the export report still emits.
function reportExportSkillFilterMiss(
    wantJson: boolean,
    errors: SkillOperationError[],
    availableSkills: string,
): void {
    if (!wantJson) {
        throw new CliUserError("errors.skills.skillFilterNoMatch", 1, {
            skills: availableSkills,
        });
    }

    errors.push({
        code: "skill_filter_no_match",
        message: installErrorMessages.skill_filter_no_match!,
    });
}

function recordExportBaseTelemetry(
    context: CliExecutionContext,
    options: {
        agentName: BundledSkillAgentName;
        skillFilterActive: boolean;
        targets: readonly ClassifiedSkillsInstallTarget[];
    },
): void {
    const registryPackageNames = [
        ...new Set(
            options.targets
                .filter(target => target.kind === "registry")
                .map(target => target.specifier.packageName),
        ),
    ];
    const hasRegistry = registryPackageNames.length > 0;
    // The no-argument export covers every bundled skill, so it always has a
    // bundled component even though no positional bundled target is present.
    const hasBundled = options.targets.length === 0
        || options.targets.some(target => target.kind === "bundled");

    context.telemetry?.recordProperties({
        agent_format: options.agentName,
        has_bundled_skill: hasBundled,
        has_out_dir: true,
        has_registry_skill: hasRegistry,
        has_skill_filter: options.skillFilterActive,
        package_kind: resolveInstallPackageKindLabel(hasBundled, hasRegistry),
        ...createPackageNamesTelemetryProperties(registryPackageNames),
    });

    if (registryPackageNames.length === 1) {
        context.telemetry?.recordProperties({
            package_name: registryPackageNames[0]!,
        });
    }
}

function buildExportReport(
    exports: readonly SkillExportResult[],
    errors: readonly SkillOperationError[],
    agentName: BundledSkillAgentName,
    outputDirectoryPath: string,
): ExportReport {
    const exported = exports.length;
    const failed = errors.length;

    return {
        command: "skills.install.export",
        status: computeCommandStatus({
            succeeded: exported,
            failed: 0,
            commandLevelErrors: failed,
            noopWhenEmpty: exported === 0 && failed === 0,
        }),
        agentFormat: agentName,
        outputDirectory: outputDirectoryPath,
        summary: {
            requestedSkills: exported + failed,
            exported,
            failed,
        },
        skills: [...exports],
        errors: [...errors],
    };
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
        const selection = resolveBundledSkillSelection(input.skill);

        if (selection.filterMissed) {
            errors.push({
                code: "skill_filter_no_match",
                message: installErrorMessages.skill_filter_no_match!,
            });

            return buildReport(skills, errors, 0);
        }

        for (const bundledName of selection.skills) {
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
        case "errors.auth.requiredConnectorOnly":
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
