import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { AuthAccount } from "../../schemas/auth.ts";
import type { ManagedSkillHost } from "./managed-skill-hosts.ts";
import type { ManagedSkillListItem } from "./managed-skill-listings.ts";
import type { RegistryPackageSkillInfo } from "./registry-skill-source.ts";

import { z } from "zod";
import { compareSemver } from "../../semver.ts";
import { bucketTelemetryCount } from "../../telemetry/buckets.ts";
import { jsonOutputOptions, writeJsonOutput } from "../json-output.ts";
import { requireCurrentAccount } from "../shared/auth-utils.ts";
import { createFormatInputError } from "../shared/input-parsing.ts";
import { writeLine } from "../shared/output.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
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
    resolveManagedSkillCanonicalRootDirectoryPath,
} from "./managed-skill-paths.ts";
import { isManagedSkillPublicationCurrent } from "./managed-skill-publication.ts";
import { loadRegistryPackageSkillInfo } from "./registry-skill-source.ts";
import { isBundledSkillName } from "./shared.ts";

type CheckUpdateStatus
    = | "update-available"
        | "up-to-date"
        | "repair-required"
        | "failed";

type CheckUpdateErrorCode
    = | "not_installed"
        | "not_managed"
        | "invalid_path"
        | "bundled_unsupported"
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

const checkUpdateFormatValues = ["json"] as const;

interface SkillsCheckUpdateInput {
    format?: (typeof checkUpdateFormatValues)[number];
    showSchemaVersion?: boolean;
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
    not_installed: "The skill is not installed.",
    not_managed: "The skill directory exists but is not managed by oo.",
    invalid_path: "Skill name resolves outside the managed skills directory.",
    bundled_unsupported: "Bundled skills are not checked by oo skills check-update.",
    package_lookup_failed: "Failed to fetch the latest package version.",
    unknown: "Unknown error.",
};

export const skillsCheckUpdateCommand: CliCommandDefinition<SkillsCheckUpdateInput> = {
    name: "check-update",
    summaryKey: "commands.skills.checkUpdate.summary",
    descriptionKey: "commands.skills.checkUpdate.description",
    options: [
        {
            name: "skill",
            longFlag: "--skill",
            valueName: "skills...",
            descriptionKey: "options.skills.checkUpdate.skill",
        },
        ...jsonOutputOptions,
    ],
    inputSchema: z.object({
        format: z.enum(checkUpdateFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
        skill: z.array(z.string()).optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        const availableHosts = await resolveAvailableManagedSkillHosts(context.env);

        if (availableHosts.length === 0) {
            throw createMissingManagedSkillHostError(context.env);
        }

        const settingsFilePath = context.settingsStore.getFilePath();
        const installedSkills = await readKnownManagedSkillInstallations(
            availableHosts,
            settingsFilePath,
        );
        const skillNames = dedupePreserveOrder(input.skill ?? []);
        const plan = await resolveCheckUpdatePlan(
            skillNames,
            installedSkills,
            availableHosts,
            settingsFilePath,
        );

        const hasRegistryEntry = plan.some(entry => entry.kind === "registry");
        const account = hasRegistryEntry
            ? await requireCurrentAccount(context)
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
            hasSkillFilter: skillNames.length > 0,
            requestedCount: skillNames.length === 0 ? results.length : skillNames.length,
        });

        if (input.format === "json") {
            writeJsonOutput(context.stdout, outcome, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        writeText(context, outcome);
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

async function resolveCheckUpdatePlan(
    requestedSkillNames: readonly string[],
    installedSkills: readonly ManagedSkillListItem[],
    availableHosts: readonly ManagedSkillHost[],
    settingsFilePath: string,
): Promise<CheckUpdatePlanEntry[]> {
    if (requestedSkillNames.length === 0) {
        return installedSkills
            .filter(skill => skill.metadata?.kind === "registry")
            .map(skill => makeRegistryPlanEntryOrFail(skill));
    }

    const installedIndex = new Map(
        installedSkills.map(skill => [skill.name, skill] as const),
    );

    return Promise.all(
        requestedSkillNames.map(skillId => resolveRequestedSkillEntry({
            skillId,
            installedIndex,
            availableHosts,
            settingsFilePath,
        })),
    );
}

async function resolveRequestedSkillEntry(options: {
    skillId: string;
    installedIndex: ReadonlyMap<string, ManagedSkillListItem>;
    availableHosts: readonly ManagedSkillHost[];
    settingsFilePath: string;
}): Promise<CheckUpdatePlanEntry> {
    const { skillId, installedIndex, availableHosts, settingsFilePath } = options;

    if (isBundledSkillName(skillId)) {
        return {
            kind: "failed",
            skillId,
            packageName: null,
            currentVersion: null,
            error: makeError("bundled_unsupported"),
        };
    }

    const hostInstallations = resolveManagedSkillHostInstallations(availableHosts, skillId);

    // Path containment is the highest-priority gate: a name that escapes the
    // managed skills directory must never resolve to a real host scan.
    if (hostInstallations.some(installation =>
        !isManagedSkillPathContained(
            installation.homeDirectory,
            settingsFilePath,
            skillId,
        ),
    )) {
        return {
            kind: "failed",
            skillId,
            packageName: null,
            currentVersion: null,
            error: makeError("invalid_path"),
        };
    }

    const installed = installedIndex.get(skillId);

    if (installed !== undefined) {
        if (installed.metadata?.kind !== "registry") {
            return {
                kind: "failed",
                skillId,
                packageName: null,
                currentVersion: null,
                error: makeError("not_managed"),
            };
        }
        return makeRegistryPlanEntryOrFail(installed);
    }

    // Not in installedSkills (no host or canonical entry recorded a managed
    // metadata file). Distinguish "directory exists but oo doesn't manage it"
    // from "skill name simply isn't installed anywhere".
    const targetHasUnmanagedDirectory = await someHostHasUnmanagedDirectory(
        hostInstallations,
    );

    if (targetHasUnmanagedDirectory) {
        return {
            kind: "failed",
            skillId,
            packageName: null,
            currentVersion: null,
            error: makeError("not_managed"),
        };
    }

    return {
        kind: "failed",
        skillId,
        packageName: null,
        currentVersion: null,
        error: makeError("not_installed"),
    };
}

async function someHostHasUnmanagedDirectory(
    hostInstallations: readonly { installedSkillDirectoryPath: string }[],
): Promise<boolean> {
    const checks = await Promise.all(
        hostInstallations.map(async (installation) => {
            if (!(await directoryExists(installation.installedSkillDirectoryPath))) {
                return false;
            }
            const metadata = await readManagedSkillMetadata(
                installation.installedSkillDirectoryPath,
            );
            return metadata === undefined;
        }),
    );
    return checks.some(Boolean);
}

function makeRegistryPlanEntryOrFail(
    skill: ManagedSkillListItem,
): CheckUpdatePlanEntry {
    if (skill.metadata?.kind !== "registry") {
        return {
            kind: "failed",
            skillId: skill.name,
            packageName: null,
            currentVersion: null,
            error: makeError("not_managed"),
        };
    }

    return {
        kind: "registry",
        target: {
            skillId: skill.name,
            packageName: skill.metadata.packageName,
            currentVersion: skill.metadata.version,
        },
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
        hostInstallations.map(async (installation) => {
            if (!(await directoryExists(installation.installedSkillDirectoryPath))) {
                return { kind: "missing" as const };
            }
            const [metadata, publicationCurrent] = await Promise.all([
                readManagedSkillMetadata(installation.installedSkillDirectoryPath),
                isManagedSkillPublicationCurrent(installation.installedSkillDirectoryPath),
            ]);
            return { kind: "present" as const, metadata, publicationCurrent };
        }),
    );

    return targetStates.every(state =>
        state.kind === "present"
        && state.metadata?.packageName === packageName
        && state.metadata.version === latestVersion
        && state.publicationCurrent,
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

async function readKnownManagedSkillInstallations(
    availableHosts: readonly ManagedSkillHost[],
    settingsFilePath: string,
): Promise<ManagedSkillListItem[]> {
    const [canonicalSkills, hostSkills] = await Promise.all([
        listManagedSkillInstallations(
            resolveManagedSkillCanonicalRootDirectoryPath(settingsFilePath),
        ),
        listManagedSkillInstallationsForHosts(availableHosts),
    ]);
    // Host listings take precedence over canonical when a name collides.
    const byName = new Map<string, ManagedSkillListItem>();

    for (const skill of [...hostSkills, ...canonicalSkills]) {
        if (skill.metadata !== undefined && !byName.has(skill.name)) {
            byName.set(skill.name, {
                metadata: skill.metadata,
                name: skill.name,
                path: skill.path,
            });
        }
    }

    return Array.from(byName.values());
}

function dedupePreserveOrder<T>(values: readonly T[]): T[] {
    const seen = new Set<T>();
    const result: T[] = [];

    for (const value of values) {
        if (!seen.has(value)) {
            seen.add(value);
            result.push(value);
        }
    }

    return result;
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
    options: { hasSkillFilter: boolean; requestedCount: number },
): void {
    context.telemetry?.recordProperties({
        has_skill_filter: options.hasSkillFilter,
        skill_count_bucket: bucketTelemetryCount(options.requestedCount),
        checked_count_bucket: bucketTelemetryCount(outcome.skills.length),
        update_available_count_bucket: bucketTelemetryCount(outcome.summary.registrySkillUpdates),
        repair_required_count_bucket: bucketTelemetryCount(outcome.summary.registrySkillRepairs),
        failed_count_bucket: bucketTelemetryCount(outcome.summary.registrySkillFailures),
    });
}
