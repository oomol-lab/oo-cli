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
import { createFormatInputError } from "../shared/input-parsing.ts";
import { removePath } from "./bundled-skill-filesystem.ts";
import { canUninstallManagedBundledSkillInstallation } from "./bundled-skill-model.ts";
import {
    directoryExists,
    readInstalledBundledSkillMetadata,
} from "./bundled-skill-observation.ts";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import { readLocalSkillMetadata } from "./local-skill-ownership.ts";
import { findLocalSkillSources } from "./local-skill-source.ts";
import { parseManagedSkillAgentOption } from "./managed-skill-agents.ts";
import {
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import { readManagedSkillMetadata } from "./managed-skill-metadata.ts";
import {
    isManagedSkillPathContained,
    resolveManagedSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import { uninstallRequestedSkill } from "./managed-skill-uninstall.ts";
import {
    computeCommandStatus,
    skillOperationOutputOptions,
    writeSkillOperationJson,
} from "./operation-result.ts";
import {
    isBundledSkillName,
    resolveAvailableBundledSkillHostInstallations,
} from "./shared.ts";

interface SkillsUninstallInput {
    agent?: string;
    skill?: string;
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
            name: "skill",
            descriptionKey: "arguments.skill",
            required: false,
        },
    ],
    options: [
        {
            name: "agent",
            longFlag: "--agent",
            valueName: "agent",
            descriptionKey: "options.agent",
        },
        ...skillOperationOutputOptions,
    ],
    inputSchema: z.object({
        agent: z.string().optional(),
        skill: z.string().optional(),
        format: z.enum(["json"]).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const agentName = parseSkillsUninstallAgent(input.agent);

        if (input.format === "json") {
            const report = await runUninstallJsonReport(
                { skillName: input.skill, agentName },
                context,
            );

            recordUninstallTelemetry(context, report, { format: "json" });
            writeSkillOperationJson(context.stdout, report, {
                showSchemaVersion: input.showSchemaVersion,
            });

            if (report.status === "partial-failure" || report.status === "failed") {
                throw new CliUserError("errors.skills.uninstall.partialFailure", 1, {
                    count: report.summary.failed + report.errors.length,
                });
            }
            return;
        }

        await uninstallRequestedSkill(input.skill, context, {
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
        skillName: string | undefined;
        agentName: BundledSkillAgentName | undefined;
    },
    context: CliExecutionContext,
): Promise<UninstallReport> {
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

    if (availableHosts.length === 0) {
        return buildReport([], [{
            code: "no_supported_hosts",
            message: uninstallErrorMessages.no_supported_hosts,
        }], 0);
    }

    const skills: SkillResult[] = [];
    let requested = 0;

    if (request.skillName === undefined) {
        for (const bundledName of availableBundledSkillNames) {
            requested += 1;
            const entry = await uninstallBundledSkillForJson(bundledName, context, {
                includeNotInstalledAsFailure: false,
            });

            if (entry !== undefined) {
                skills.push(entry);
            }
        }
        return buildReport(skills, [], requested);
    }

    requested = 1;

    if (isBundledSkillName(request.skillName)) {
        const entry = await uninstallBundledSkillForJson(request.skillName, context, {
            includeNotInstalledAsFailure: true,
        });
        if (entry !== undefined) {
            skills.push(entry);
        }
        return buildReport(skills, [], requested);
    }

    // Try local first so a local skill at <host>/skills/<name> is not
    // misclassified as an "unmanaged registry directory" by the registry
    // path (which only matches kind=registry metadata).
    const localEntry = await uninstallLocalSkillForJson(
        request.skillName,
        request.agentName,
        context,
    );

    if (localEntry !== undefined) {
        skills.push(localEntry);
        return buildReport(skills, [], requested);
    }

    const registryEntry = await uninstallRegistrySkillForJson(request.skillName, context);

    if (registryEntry.outcome === "removed" || registryEntry.outcome === "failed") {
        skills.push(registryEntry.entry);
        return buildReport(skills, [], requested);
    }

    skills.push(buildNotInstalledSkillResult(request.skillName));
    return buildReport(skills, [], requested);
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
        const installedDirectoryExists = await directoryExists(
            installation.installedSkillDirectoryPath,
        );
        const installedMetadata = installedDirectoryExists
            ? await readInstalledBundledSkillMetadata(installation.installedSkillDirectoryPath)
            : undefined;
        const managed = installedMetadata !== undefined;

        if (!canUninstallManagedBundledSkillInstallation({
            installedDirectoryExists,
            installedDirectoryManaged: managed,
        })) {
            if (!installedDirectoryExists) {
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
            lastRemovedVersion = installedMetadata?.version ?? lastRemovedVersion;
            targets.push({
                agentId: installation.agentName,
                status: "removed",
                path: installation.installedSkillDirectoryPath,
                sourcePath: installation.canonicalSkillDirectoryPath,
                version: null,
                previousVersion: installedMetadata?.version ?? null,
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
                previousVersion: installedMetadata?.version ?? null,
                previousState: managed ? "managed" : "unknown",
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
        if (!(await directoryExists(installation.installedSkillDirectoryPath))) {
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

        const metadata = await readManagedSkillMetadata(
            installation.installedSkillDirectoryPath,
        );

        if (metadata === undefined) {
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
        packageName = metadata.packageName ?? packageName;
        previousVersion = metadata.version ?? previousVersion;

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

    if (await readLocalSkillMetadata(source.path) === undefined) {
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
    options: { format: "json" | "text" },
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
    });
}
