import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { InstalledSkill } from "./installed-skills.ts";
import type { ManagedSkillHost } from "./managed-skill-hosts.ts";
import type { RegistryPackageSkillInfo } from "./registry-skill-source.ts";

import { z } from "zod";
import { requireIdentity } from "../../auth/identity.ts";
import { CliUserError } from "../../contracts/cli.ts";
import { compareSemver } from "../../semver.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { writeLine } from "../shared/output.ts";
import {
    groupInstalledSkillsByPackageName,
    isInstalledRegistrySkill,
    readInstalledSkills,
} from "./installed-skills.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import { loadRegistryPackageSkillInfo } from "./registry-skill-source.ts";
import { isBundledSkillName } from "./shared.ts";
import {
    isCurrentRegistryPublication,
    readSkillDirectoryState,
} from "./skill-directory-state.ts";
import {
    normalizeSkillFilterTokens,
    skillMatchesFilterTokens,
} from "./skill-filter.ts";
import { createPackageNamesTelemetryProperties } from "./telemetry.ts";

type CheckUpdateStatus
    = | "update-available"
        | "up-to-date"
        | "repair-required"
        | "failed";

type CheckUpdateErrorCode
    = | "bundled_unsupported"
        | "package_not_installed"
        | "package_lookup_failed"
        | "unknown";

interface CheckUpdateResultEntry {
    skillId: string;
    packageName: string | null;
    currentVersion: string | null;
    latestVersion: string | null;
    status: CheckUpdateStatus;
    error?: {
        code: CheckUpdateErrorCode;
        message: string;
    };
}

interface CheckUpdateOutcome {
    summary: {
        registrySkills: number;
        registrySkillUpdates: number;
        registrySkillRepairs: number;
        registrySkillsCurrent: number;
        registrySkillFailures: number;
    };
    skills: CheckUpdateResultEntry[];
}

interface SkillsCheckUpdateInput {
    packageNames?: string[];
    skill?: string[];
}

interface RegistrySkillTarget {
    skillId: string;
    packageName: string;
    currentVersion: string;
}

interface CheckUpdateError {
    code: CheckUpdateErrorCode;
    message: string;
}

const checkUpdateErrorMessages: Record<CheckUpdateErrorCode, string> = {
    bundled_unsupported: "Bundled skills are not checked by oo skills check-update.",
    package_not_installed: "No installed oo-managed skill belongs to the requested package.",
    package_lookup_failed: "Failed to fetch the latest package version.",
    unknown: "Unknown error.",
};

export const skillsCheckUpdateCommand: CliCommandDefinition<SkillsCheckUpdateInput> = {
    name: "check-update",
    summaryKey: "commands.skills.checkUpdate.summary",
    descriptionKey: "commands.skills.checkUpdate.description",
    arguments: [
        {
            name: "packageNames",
            descriptionKey: "arguments.skills.checkUpdate.packageName",
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
        const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

        if (availableHosts.length === 0) {
            throw createMissingManagedSkillHostError(context.env);
        }

        const installedSkills = await readInstalledSkills(
            context.env,
            context.settingsStore.getFilePath(),
        );
        const packageNames = [...new Set(input.packageNames ?? [])];
        // Record the skill-filter dimension before the no-match check can throw,
        // so the telemetry is present even when --skill excludes every entry.
        // Derive it from the normalized tokens so blank values are not reported
        // as an active filter.
        context.telemetry?.recordProperties({
            has_skill_filter: normalizeSkillFilterTokens(input.skill) !== undefined,
        });
        // The `--skill` filter narrows the resolved registry entries before any
        // network lookup; unmatched names are ignored, and an error listing the
        // resolved skills is raised when nothing matches.
        const plan = applyCheckUpdateSkillFilter(
            resolveCheckUpdatePlan(packageNames, installedSkills),
            input.skill,
        );

        const hasRegistryEntry = plan.some(entry => entry.kind === "registry");
        const account = hasRegistryEntry
            ? (await requireIdentity(context)).account
            : undefined;
        const packageInfoCache = new Map<string, Promise<RegistryPackageSkillInfo | "failed">>();

        const results = await Promise.all(
            plan.map(async (planEntry): Promise<CheckUpdateResultEntry> => {
                if (planEntry.kind === "failed") {
                    return toFailedEntry(planEntry);
                }
                // Invariant: plan has at least one registry entry, so account is defined.
                return checkRegistrySkill(
                    planEntry.target,
                    availableHosts,
                    packageInfoCache,
                    account as AuthAccount,
                    context,
                );
            }),
        );

        const outcome: CheckUpdateOutcome = {
            summary: computeSummary(results),
            skills: results,
        };

        recordTelemetry(context, outcome, {
            hasPackageFilter: packageNames.length > 0,
            packageNames,
        });

        context.output.emit(outcome, () => {
            writeText(context, outcome);
        });
    },
};

interface CheckUpdatePlanEntryFailed {
    kind: "failed";
    skillId: string;
    packageName: string | null;
    currentVersion: string | null;
    error: CheckUpdateError;
}

interface CheckUpdatePlanEntryRegistry {
    kind: "registry";
    target: RegistrySkillTarget;
}

type CheckUpdatePlanEntry = CheckUpdatePlanEntryFailed | CheckUpdatePlanEntryRegistry;

// Build the check plan from package names. The positional arguments are
// package names: each package contributes every installed skill that carries
// that package identity. When no package name is given, every installed
// managed registry skill is checked. Package names are assumed de-duplicated
// (the handler preserves the original input order). Bundled skill names and
// packages with no installed skill become failed entries.
function resolveCheckUpdatePlan(
    requestedPackageNames: readonly string[],
    installedSkills: readonly InstalledSkill[],
): CheckUpdatePlanEntry[] {
    if (requestedPackageNames.length === 0) {
        const entries: CheckUpdatePlanEntry[] = [];

        for (const skill of installedSkills) {
            const target = toRegistrySkillTarget(skill);

            if (target !== undefined) {
                entries.push({ kind: "registry", target });
            }
        }

        return entries;
    }

    const skillsByPackageName = groupInstalledSkillsByPackageName(installedSkills);
    const entries: CheckUpdatePlanEntry[] = [];

    for (const packageName of requestedPackageNames) {
        if (isBundledSkillName(packageName)) {
            entries.push(makeFailedPlanEntry(packageName, "bundled_unsupported"));
            continue;
        }

        const targets = (skillsByPackageName.get(packageName) ?? [])
            .map(toRegistrySkillTarget)
            .filter(target => target !== undefined);

        if (targets.length === 0) {
            entries.push(makeFailedPlanEntry(packageName, "package_not_installed"));
            continue;
        }

        for (const target of targets) {
            entries.push({ kind: "registry", target });
        }
    }

    return entries;
}

// Narrow the resolved registry entries by the optional `--skill` filter,
// keeping any failed entries (bundled/not-installed package arguments) intact.
// Returns the plan unchanged when no filter is active, and throws a listing
// error when the filter excludes every registry entry.
function applyCheckUpdateSkillFilter(
    plan: readonly CheckUpdatePlanEntry[],
    skillFilter: readonly string[] | undefined,
): CheckUpdatePlanEntry[] {
    const tokens = normalizeSkillFilterTokens(skillFilter);

    if (tokens === undefined) {
        return [...plan];
    }

    const registryEntries = plan.filter(entry => entry.kind === "registry");

    if (registryEntries.length === 0) {
        return [...plan];
    }

    const matched = new Set(
        registryEntries.filter(entry =>
            skillMatchesFilterTokens({ name: entry.target.skillId }, tokens),
        ),
    );

    if (matched.size === 0) {
        throw new CliUserError("errors.skills.skillFilterNoMatch", 1, {
            skills: registryEntries.map(entry => entry.target.skillId).join(", "),
        });
    }

    return plan.filter(entry => entry.kind !== "registry" || matched.has(entry));
}

function toRegistrySkillTarget(
    skill: InstalledSkill,
): RegistrySkillTarget | undefined {
    if (!isInstalledRegistrySkill(skill)) {
        return undefined;
    }

    return {
        skillId: skill.name,
        packageName: skill.packageName,
        currentVersion: skill.version,
    };
}

function makeFailedPlanEntry(
    packageName: string,
    code: CheckUpdateErrorCode,
): CheckUpdatePlanEntryFailed {
    return {
        kind: "failed",
        skillId: packageName,
        packageName,
        currentVersion: null,
        error: makeError(code),
    };
}

async function checkRegistrySkill(
    target: RegistrySkillTarget,
    availableHosts: readonly ManagedSkillHost[],
    packageInfoCache: Map<string, Promise<RegistryPackageSkillInfo | "failed">>,
    account: AuthAccount,
    context: CliExecutionContext,
): Promise<CheckUpdateResultEntry> {
    const hostInstallations = resolveManagedSkillHostInstallations(
        availableHosts,
        target.skillId,
    );
    const packageInfo = await loadPackageInfoCached(
        target.packageName,
        account,
        packageInfoCache,
        context,
    );

    if (packageInfo === "failed") {
        return {
            skillId: target.skillId,
            packageName: target.packageName,
            currentVersion: target.currentVersion,
            latestVersion: null,
            status: "failed",
            error: makeError("package_lookup_failed"),
        };
    }

    const latestVersion = packageInfo.packageVersion;
    const versionDelta = compareSemver(latestVersion, target.currentVersion);

    if (versionDelta > 0) {
        return {
            skillId: target.skillId,
            packageName: target.packageName,
            currentVersion: target.currentVersion,
            latestVersion,
            status: "update-available",
        };
    }

    const allHostsCurrent = await isEverythingCurrent(
        hostInstallations,
        target.packageName,
        latestVersion,
    );

    return {
        skillId: target.skillId,
        packageName: target.packageName,
        currentVersion: target.currentVersion,
        latestVersion,
        status: allHostsCurrent ? "up-to-date" : "repair-required",
    };
}

async function isEverythingCurrent(
    hostInstallations: readonly { installedSkillDirectoryPath: string }[],
    packageName: string,
    latestVersion: string,
): Promise<boolean> {
    const targetStates = await Promise.all(
        hostInstallations.map(installation =>
            readSkillDirectoryState(installation.installedSkillDirectoryPath),
        ),
    );

    return targetStates.every(state =>
        isCurrentRegistryPublication(state, {
            packageName,
            version: latestVersion,
        }),
    );
}

function loadPackageInfoCached(
    packageName: string,
    account: AuthAccount,
    cache: Map<string, Promise<RegistryPackageSkillInfo | "failed">>,
    context: CliExecutionContext,
): Promise<RegistryPackageSkillInfo | "failed"> {
    // Cache stores the in-flight promise so concurrent lookups for the same
    // package share a single network request.
    const existing = cache.get(packageName);

    if (existing !== undefined) {
        return existing;
    }
    const pending = loadRegistryPackageSkillInfo(packageName, account, context)
        .catch((error: unknown) => {
            context.logger.warn(
                { err: error, packageName },
                "skills check-update package lookup failed.",
            );
            return "failed" as const;
        });

    cache.set(packageName, pending);
    return pending;
}

function toFailedEntry(entry: CheckUpdatePlanEntryFailed): CheckUpdateResultEntry {
    return {
        skillId: entry.skillId,
        packageName: entry.packageName,
        currentVersion: entry.currentVersion,
        latestVersion: null,
        status: "failed",
        error: entry.error,
    };
}

function makeError(code: CheckUpdateErrorCode): CheckUpdateError {
    return {
        code,
        message: checkUpdateErrorMessages[code],
    };
}

function computeSummary(results: readonly CheckUpdateResultEntry[]): CheckUpdateOutcome["summary"] {
    return {
        registrySkills: results.length,
        registrySkillUpdates: results.filter(entry => entry.status === "update-available").length,
        registrySkillRepairs: results.filter(entry => entry.status === "repair-required").length,
        registrySkillsCurrent: results.filter(entry => entry.status === "up-to-date").length,
        registrySkillFailures: results.filter(entry => entry.status === "failed").length,
    };
}

function writeText(
    context: CliExecutionContext,
    outcome: CheckUpdateOutcome,
): void {
    const updates = outcome.skills.filter(entry => entry.status === "update-available");
    const repairs = outcome.skills.filter(entry => entry.status === "repair-required");
    const failures = outcome.skills.filter(entry => entry.status === "failed");

    if (
        outcome.summary.registrySkillUpdates === 0
        && outcome.summary.registrySkillRepairs === 0
        && outcome.summary.registrySkillFailures === 0
    ) {
        writeLine(
            context.stdout,
            context.translator.t("skills.checkUpdate.allCurrent"),
        );
        return;
    }

    writeLine(
        context.stdout,
        context.translator.t("skills.checkUpdate.summary", {
            updates: outcome.summary.registrySkillUpdates,
            repairs: outcome.summary.registrySkillRepairs,
            current: outcome.summary.registrySkillsCurrent,
            failed: outcome.summary.registrySkillFailures,
        }),
    );

    writeReportSection(context, updates, "skills.checkUpdate.updatesHeader", "skills.checkUpdate.updatesLine", entry => ({
        skillId: entry.skillId,
        packageName: entry.packageName ?? "",
        currentVersion: entry.currentVersion ?? "",
        latestVersion: entry.latestVersion ?? "",
    }));
    writeReportSection(context, repairs, "skills.checkUpdate.repairsHeader", "skills.checkUpdate.repairsLine", entry => ({
        skillId: entry.skillId,
        packageName: entry.packageName ?? "",
        currentVersion: entry.currentVersion ?? "",
    }));
    writeReportSection(context, failures, "skills.checkUpdate.failuresHeader", "skills.checkUpdate.failuresLine", entry => ({
        skillId: entry.skillId,
        message: entry.error?.message ?? "",
    }));
}

function writeReportSection(
    context: CliExecutionContext,
    entries: readonly CheckUpdateResultEntry[],
    headerKey: string,
    lineKey: string,
    formatEntry: (entry: CheckUpdateResultEntry) => Record<string, string>,
): void {
    if (entries.length === 0) {
        return;
    }
    writeLine(context.stdout, "");
    writeLine(context.stdout, context.translator.t(headerKey));
    for (const entry of entries) {
        writeLine(context.stdout, context.translator.t(lineKey, formatEntry(entry)));
    }
}

function recordTelemetry(
    context: CliExecutionContext,
    outcome: CheckUpdateOutcome,
    options: {
        hasPackageFilter: boolean;
        packageNames: readonly string[];
    },
): void {
    context.telemetry?.recordProperties({
        has_package_filter: options.hasPackageFilter,
        package_count_bucket: bucketTelemetryCount(options.packageNames.length),
        checked_count_bucket: bucketTelemetryCount(outcome.skills.length),
        update_available_count_bucket: bucketTelemetryCount(outcome.summary.registrySkillUpdates),
        repair_required_count_bucket: bucketTelemetryCount(outcome.summary.registrySkillRepairs),
        failed_count_bucket: bucketTelemetryCount(outcome.summary.registrySkillFailures),
        ...createPackageNamesTelemetryProperties(options.packageNames),
    });
}
