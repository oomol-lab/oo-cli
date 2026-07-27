import type {
    CliCommandDefinition,
    CliExecutionContext,
} from "../../contracts/cli.ts";
import type {
    BundledSkillAgentName,
    BundledSkillName,
} from "./embedded-assets.ts";

import type {
    SkillKind,
    SkillOperationError,
    SkillResult,
    SkillTargetResult,
    UninstallReport,
} from "./operation-result.ts";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { removePath } from "./bundled-skill-filesystem.ts";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import {
    installedRegistrySkillNamesForPackage,
    readInstalledSkills,
} from "./installed-skills.ts";
import { findLocalSkillSources } from "./local-skill-source.ts";
import { parseManagedSkillAgentOption } from "./managed-skill-agents.ts";
import {
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import {
    isManagedSkillPathContained,
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import { uninstallRequestedSkills } from "./managed-skill-uninstall.ts";
import {
    computeCommandStatus,
} from "./operation-result.ts";
import {
    isBundledSkillName,
    isScopedPackageName,
    resolveAvailableBundledSkillHostInstallations,
} from "./shared.ts";
import {
    isSkillDirectoryAbsent,
    managedMetadataOfKind,
    readSkillDirectoryState,
} from "./skill-directory-state.ts";

interface SkillsUninstallInput {
    agent?: string;
    skills?: string[];
    format?: "json";
    showSchemaVersion?: boolean;
}

type UninstallErrorCode
    = | "no_supported_hosts"
        | "invalid_path"
        | "not_installed"
        | "not_managed"
        | "ambiguous_local_skill"
        | "remove_failed"
        | "unknown";

const uninstallErrorMessages: Record<UninstallErrorCode, string> = {
    no_supported_hosts: "No supported skill host is installed.",
    invalid_path: "Skill name resolves outside the managed skills directory.",
    not_installed: "The skill is not installed.",
    not_managed: "The skill directory exists but is not managed by oo.",
    ambiguous_local_skill: "Local skill matches multiple agents; pass --agent to disambiguate.",
    remove_failed: "Failed to remove the skill directory.",
    unknown: "Unknown error.",
};

export const skillsUninstallCommand: CliCommandDefinition<SkillsUninstallInput> = {
    name: "uninstall",
    aliases: ["remove"],
    summaryKey: "commands.skills.uninstall.summary",
    descriptionKey: "commands.skills.uninstall.description",
    arguments: [
        {
            name: "skills",
            descriptionKey: "arguments.skills.uninstall.name",
            required: false,
            variadic: true,
        },
    ],
    options: [
        {
            name: "agent",
            longFlag: "--agent",
            valueName: "agent",
            descriptionKey: "options.agent",
        },
        ...jsonOutputOptions,
    ],
    inputSchema: z.object({
        agent: z.string().optional(),
        skills: z.array(z.string()).optional(),
        format: z.enum(["json"]).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const agentName = parseSkillsUninstallAgent(input.agent);
        const skillNames = input.skills ?? [];

        if (input.format === "json") {
            const { report, hasPackageTarget } = await runUninstallJsonReport(
                { skillNames, agentName },
                context,
            );

            recordUninstallTelemetry(context, report, {
                format: "json",
                hasPackageTarget,
            });
            writeJsonOutput(context.stdout, report, {
                showSchemaVersion: input.showSchemaVersion,
            });

            if (report.status === "partial-failure" || report.status === "failed") {
                throw new CliUserError("errors.skills.uninstall.partialFailure", 1, {
                    count: report.summary.failed + report.errors.length,
                });
            }
            return;
        }

        await uninstallRequestedSkills(skillNames, context, {
            agentName,
        });
    },
};

function parseSkillsUninstallAgent(
    value: string | undefined,
): BundledSkillAgentName | undefined {
    return parseManagedSkillAgentOption(value, "errors.skills.uninstall.invalidAgent");
}

async function runUninstallJsonReport(
    request: {
        skillNames: readonly string[];
        agentName: BundledSkillAgentName | undefined;
    },
    context: CliExecutionContext,
): Promise<{ report: UninstallReport; hasPackageTarget: boolean }> {
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

    if (availableHosts.length === 0) {
        return {
            report: buildReport([], [{
                code: "no_supported_hosts",
                message: uninstallErrorMessages.no_supported_hosts,
            }], 0),
            hasPackageTarget: false,
        };
    }

    if (request.skillNames.length === 0) {
        const skills: SkillResult[] = [];
        let requested = 0;

        for (const bundledName of availableBundledSkillNames) {
            requested += 1;
            const entry = await uninstallBundledSkillForJson(bundledName, context, {
                includeNotInstalledAsFailure: false,
            });

            if (entry !== undefined) {
                skills.push(entry);
            }
        }
        return { report: buildReport(skills, [], requested), hasPackageTarget: false };
    }

    const settingsFilePath = context.settingsStore.getFilePath();
    const skills: SkillResult[] = [];
    let hasPackageTarget = false;

    for (const name of request.skillNames) {
        const resolution = await uninstallNameForJson(name, request.agentName, context, {
            settingsFilePath,
        });

        skills.push(...resolution.skills);

        if (resolution.usedPackage) {
            hasPackageTarget = true;
        }
    }

    // Each positional argument counts as one requested target regardless of how
    // many installed skills a package name expands to.
    return {
        report: buildReport(skills, [], request.skillNames.length),
        hasPackageTarget,
    };
}

interface UninstallNameResolution {
    skills: SkillResult[];
    usedPackage: boolean;
}

// Resolve a single positional argument. A scoped `@scope/name` value is always
// treated as a package; any other value is tried as a skill name first
// (bundled, local, then registry) and only falls back to a package lookup when
// no skill is installed under that name.
async function uninstallNameForJson(
    name: string,
    agentName: BundledSkillAgentName | undefined,
    context: CliExecutionContext,
    options: { settingsFilePath: string },
): Promise<UninstallNameResolution> {
    if (isScopedPackageName(name)) {
        return {
            skills: await uninstallPackageForJson(name, context, options),
            usedPackage: true,
        };
    }

    if (isBundledSkillName(name)) {
        const entry = await uninstallBundledSkillForJson(name, context, {
            includeNotInstalledAsFailure: true,
        });

        return { skills: entry === undefined ? [] : [entry], usedPackage: false };
    }

    // Remove the local skill first so a local skill at <host>/skills/<name> is
    // not misclassified as an "unmanaged registry directory" by the registry
    // path (which only matches kind=registry metadata).
    const localEntry = await uninstallLocalSkillForJson(name, agentName, context);
    const localRemoved = localEntry?.status === "removed";

    // A local skill that could not be removed (ambiguous or failed) is the
    // terminal outcome for this name: surface it as-is and skip the registry
    // path, which would otherwise flag the still-present local directory.
    if (localEntry !== undefined && !localRemoved) {
        return { skills: [localEntry], usedPackage: false };
    }

    // Mirror the text path: a registry and a local skill that share a name are
    // both removed. After a local removal, a registry-side failure (e.g. an
    // unmanaged same-name directory on another host) does not fail the command,
    // so only a successful registry removal is reported alongside the local one.
    const registryEntry = await uninstallRegistrySkillForJson(name, context);
    const directSkills: SkillResult[] = [];

    if (localEntry !== undefined) {
        directSkills.push(localEntry);
    }
    if (
        registryEntry.outcome === "removed"
        || (registryEntry.outcome === "failed" && !localRemoved)
    ) {
        directSkills.push(registryEntry.entry);
    }
    if (directSkills.length > 0) {
        return { skills: directSkills, usedPackage: false };
    }

    // The name matches no installed skill; treat it as a package and remove
    // every installed skill that belongs to it.
    return {
        skills: await uninstallPackageForJson(name, context, options),
        usedPackage: true,
    };
}

async function uninstallPackageForJson(
    packageName: string,
    context: CliExecutionContext,
    options: { settingsFilePath: string },
): Promise<SkillResult[]> {
    const skillNames = installedRegistrySkillNamesForPackage(
        await readInstalledSkills(context.env, options.settingsFilePath),
        packageName,
    );

    if (skillNames.length === 0) {
        return [buildNotInstalledSkillResult(packageName)];
    }

    const results: SkillResult[] = [];

    for (const skillName of skillNames) {
        const outcome = await uninstallRegistrySkillForJson(skillName, context);

        results.push(outcome.outcome === "not-applicable"
            ? buildNotInstalledSkillResult(skillName, "registry")
            : outcome.entry);
    }

    return results;
}

function buildReport(
    skills: SkillResult[],
    commandErrors: SkillOperationError[],
    requestedSkills: number,
): UninstallReport {
    const removed = skills.filter(skill => skill.status === "removed").length;
    const failed = skills.filter(skill => skill.status === "failed").length;
    const skipped = skills.filter(skill => skill.status === "skipped").length;
    const status = computeCommandStatus({
        succeeded: removed,
        failed,
        commandLevelErrors: commandErrors.length,
        noopWhenEmpty: skills.length === 0 && commandErrors.length === 0,
    });

    return {
        command: "skills.uninstall",
        status,
        summary: {
            requestedSkills,
            removed,
            skipped,
            failed,
        },
        skills,
        errors: commandErrors,
    };
}

async function uninstallBundledSkillForJson(
    skillName: BundledSkillName,
    context: CliExecutionContext,
    options: { includeNotInstalledAsFailure: boolean },
): Promise<SkillResult | undefined> {
    const installations = await resolveAvailableBundledSkillHostInstallations(
        context,
        skillName,
    );

    if (installations.length === 0) {
        return options.includeNotInstalledAsFailure
            ? buildNotInstalledSkillResult(skillName)
            : undefined;
    }

    const targets: SkillTargetResult[] = [];
    let hasUnmanaged = false;
    let removedCount = 0;
    let lastRemovedVersion: string | undefined;

    for (const installation of installations) {
        const targetState = await readSkillDirectoryState(
            installation.installedSkillDirectoryPath,
        );
        const installedMetadata = managedMetadataOfKind(targetState, "bundled");

        if (installedMetadata === undefined) {
            if (isSkillDirectoryAbsent(targetState)) {
                targets.push({
                    agentId: installation.agentName,
                    status: "absent",
                    path: installation.installedSkillDirectoryPath,
                    sourcePath: installation.canonicalSkillDirectoryPath,
                    version: null,
                    previousVersion: null,
                    previousState: "absent",
                });
                continue;
            }

            hasUnmanaged = true;
            targets.push({
                agentId: installation.agentName,
                status: "unmanaged",
                path: installation.installedSkillDirectoryPath,
                sourcePath: installation.canonicalSkillDirectoryPath,
                version: null,
                previousVersion: null,
                previousState: "unmanaged",
                error: {
                    code: "not_managed",
                    message: uninstallErrorMessages.not_managed,
                },
            });
            continue;
        }

        try {
            await Promise.all([
                removePath(installation.installedSkillDirectoryPath),
                removePath(installation.canonicalSkillDirectoryPath),
            ]);

            removedCount += 1;
            lastRemovedVersion = installedMetadata.version;
            targets.push({
                agentId: installation.agentName,
                status: "removed",
                path: installation.installedSkillDirectoryPath,
                sourcePath: installation.canonicalSkillDirectoryPath,
                version: null,
                previousVersion: installedMetadata.version,
                previousState: "managed",
            });
        }
        catch (error) {
            targets.push({
                agentId: installation.agentName,
                status: "failed",
                path: installation.installedSkillDirectoryPath,
                sourcePath: installation.canonicalSkillDirectoryPath,
                version: null,
                previousVersion: installedMetadata.version,
                previousState: "managed",
                error: {
                    code: "remove_failed",
                    message: uninstallErrorMessages.remove_failed,
                },
            });
            context.logger.warn(
                { err: error, agentName: installation.agentName, skillName },
                "Bundled skill uninstall failed.",
            );
        }
    }

    const allAbsent = targets.every(target => target.status === "absent");

    if (allAbsent) {
        if (options.includeNotInstalledAsFailure) {
            return {
                skillId: skillName,
                kind: "bundled",
                packageName: null,
                previousVersion: null,
                version: null,
                status: "failed",
                targets,
                error: {
                    code: "not_installed",
                    message: uninstallErrorMessages.not_installed,
                },
            };
        }
        return undefined;
    }

    if (hasUnmanaged && removedCount === 0) {
        return {
            skillId: skillName,
            kind: "bundled",
            packageName: null,
            previousVersion: lastRemovedVersion ?? null,
            version: null,
            status: "failed",
            targets,
            error: {
                code: "not_managed",
                message: uninstallErrorMessages.not_managed,
            },
        };
    }

    if (targets.some(target => target.status === "failed")) {
        return {
            skillId: skillName,
            kind: "bundled",
            packageName: null,
            previousVersion: lastRemovedVersion ?? null,
            version: null,
            status: "failed",
            targets,
            error: {
                code: "remove_failed",
                message: uninstallErrorMessages.remove_failed,
            },
        };
    }

    return {
        skillId: skillName,
        kind: "bundled",
        packageName: null,
        previousVersion: lastRemovedVersion ?? null,
        version: null,
        status: "removed",
        targets,
    };
}

interface RegistryUninstallOutcome {
    outcome: "removed" | "failed" | "not-applicable";
    entry: SkillResult;
}

async function uninstallRegistrySkillForJson(
    skillName: string,
    context: CliExecutionContext,
): Promise<RegistryUninstallOutcome> {
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);
    const settingsFilePath = context.settingsStore.getFilePath();
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
        return {
            outcome: "failed",
            entry: {
                skillId: skillName,
                kind: "registry",
                packageName: null,
                previousVersion: null,
                version: null,
                status: "failed",
                targets: [],
                error: {
                    code: "invalid_path",
                    message: uninstallErrorMessages.invalid_path,
                },
            },
        };
    }

    const canonicalDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillName,
    );

    const targets: SkillTargetResult[] = [];
    let hasManaged = false;
    let hasUnmanaged = false;
    let removedCount = 0;
    let packageName: string | undefined;
    let previousVersion: string | undefined;

    for (const installation of hostInstallations) {
        const targetState = await readSkillDirectoryState(
            installation.installedSkillDirectoryPath,
        );
        const metadata = managedMetadataOfKind(targetState, "registry");

        if (metadata === undefined) {
            if (isSkillDirectoryAbsent(targetState)) {
                targets.push({
                    agentId: installation.agentName,
                    status: "absent",
                    path: installation.installedSkillDirectoryPath,
                    sourcePath: canonicalDirectoryPath,
                    version: null,
                    previousVersion: null,
                    previousState: "absent",
                });
                continue;
            }

            hasUnmanaged = true;
            targets.push({
                agentId: installation.agentName,
                status: "unmanaged",
                path: installation.installedSkillDirectoryPath,
                sourcePath: canonicalDirectoryPath,
                version: null,
                previousVersion: null,
                previousState: "unmanaged",
                error: {
                    code: "not_managed",
                    message: uninstallErrorMessages.not_managed,
                },
            });
            continue;
        }

        hasManaged = true;
        packageName = metadata.packageName;
        previousVersion = metadata.version;

        try {
            await removePath(installation.installedSkillDirectoryPath);
            removedCount += 1;
            targets.push({
                agentId: installation.agentName,
                status: "removed",
                path: installation.installedSkillDirectoryPath,
                sourcePath: canonicalDirectoryPath,
                version: null,
                previousVersion: metadata.version,
                previousState: "managed",
            });
        }
        catch (error) {
            targets.push({
                agentId: installation.agentName,
                status: "failed",
                path: installation.installedSkillDirectoryPath,
                sourcePath: canonicalDirectoryPath,
                version: null,
                previousVersion: metadata.version,
                previousState: "managed",
                error: {
                    code: "remove_failed",
                    message: uninstallErrorMessages.remove_failed,
                },
            });
            context.logger.warn(
                { err: error, agentName: installation.agentName, skillName },
                "Registry skill uninstall failed.",
            );
        }
    }

    if (removedCount > 0) {
        try {
            await removePath(canonicalDirectoryPath);
        }
        catch (error) {
            context.logger.warn(
                { err: error, skillName },
                "Failed to remove canonical registry skill directory.",
            );
        }
    }

    if (!hasManaged && !hasUnmanaged) {
        return {
            outcome: "not-applicable",
            entry: buildNotInstalledSkillResult(skillName, "registry"),
        };
    }

    if (hasUnmanaged && removedCount === 0) {
        return {
            outcome: "failed",
            entry: {
                skillId: skillName,
                kind: "registry",
                packageName: packageName ?? null,
                previousVersion: previousVersion ?? null,
                version: null,
                status: "failed",
                targets,
                error: {
                    code: "not_managed",
                    message: uninstallErrorMessages.not_managed,
                },
            },
        };
    }

    if (targets.some(target => target.status === "failed")) {
        return {
            outcome: "failed",
            entry: {
                skillId: skillName,
                kind: "registry",
                packageName: packageName ?? null,
                previousVersion: previousVersion ?? null,
                version: null,
                status: "failed",
                targets,
                error: {
                    code: "remove_failed",
                    message: uninstallErrorMessages.remove_failed,
                },
            },
        };
    }

    return {
        outcome: "removed",
        entry: {
            skillId: skillName,
            kind: "registry",
            packageName: packageName ?? null,
            previousVersion: previousVersion ?? null,
            version: null,
            status: "removed",
            targets,
        },
    };
}

async function uninstallLocalSkillForJson(
    skillName: string,
    agentName: BundledSkillAgentName | undefined,
    context: CliExecutionContext,
): Promise<SkillResult | undefined> {
    const sources = await findLocalSkillSources({
        agentName,
        context: { env: context.env },
        skillName,
    });

    if (sources.length === 0) {
        return undefined;
    }

    if (agentName === undefined && sources.length > 1) {
        return {
            skillId: skillName,
            kind: "local",
            packageName: null,
            previousVersion: null,
            version: null,
            status: "failed",
            targets: sources.map(source => ({
                agentId: source.agentName,
                status: "skipped",
                path: source.path,
                sourcePath: source.path,
                version: null,
                previousVersion: null,
                previousState: "managed",
            })),
            error: {
                code: "ambiguous_local_skill",
                message: uninstallErrorMessages.ambiguous_local_skill,
            },
        };
    }

    const source = sources[0]!;
    const sourceState = await readSkillDirectoryState(source.path);

    if (managedMetadataOfKind(sourceState, "local") === undefined) {
        return undefined;
    }

    try {
        await removePath(source.path);
        return {
            skillId: skillName,
            kind: "local",
            packageName: null,
            previousVersion: null,
            version: null,
            status: "removed",
            targets: [{
                agentId: source.agentName,
                status: "removed",
                path: source.path,
                sourcePath: source.path,
                version: null,
                previousVersion: null,
                previousState: "managed",
            }],
        };
    }
    catch (error) {
        context.logger.warn(
            { err: error, agentName: source.agentName, skillName },
            "Local skill uninstall failed.",
        );
        return {
            skillId: skillName,
            kind: "local",
            packageName: null,
            previousVersion: null,
            version: null,
            status: "failed",
            targets: [{
                agentId: source.agentName,
                status: "failed",
                path: source.path,
                sourcePath: source.path,
                version: null,
                previousVersion: null,
                previousState: "managed",
                error: {
                    code: "remove_failed",
                    message: uninstallErrorMessages.remove_failed,
                },
            }],
            error: {
                code: "remove_failed",
                message: uninstallErrorMessages.remove_failed,
            },
        };
    }
}

function buildNotInstalledSkillResult(
    skillName: string,
    kind: SkillKind = "unknown",
): SkillResult {
    return {
        skillId: skillName,
        kind,
        packageName: null,
        previousVersion: null,
        version: null,
        status: "failed",
        targets: [],
        error: {
            code: "not_installed",
            message: uninstallErrorMessages.not_installed,
        },
    };
}

function recordUninstallTelemetry(
    context: CliExecutionContext,
    report: UninstallReport,
    options: { format: "json" | "text"; hasPackageTarget: boolean },
): void {
    const hasBundled = report.skills.some(skill => skill.kind === "bundled");
    const hasRegistry = report.skills.some(skill => skill.kind === "registry");
    const hasLocal = report.skills.some(skill => skill.kind === "local");

    context.telemetry?.recordProperties({
        format: options.format,
        skill_count_bucket: bucketTelemetryCount(report.summary.requestedSkills),
        removed_count_bucket: bucketTelemetryCount(report.summary.removed),
        failed_count_bucket: bucketTelemetryCount(report.summary.failed),
        has_bundled_skill: hasBundled,
        has_registry_skill: hasRegistry,
        has_local_skill: hasLocal,
        has_package_target: options.hasPackageTarget,
    });
}
