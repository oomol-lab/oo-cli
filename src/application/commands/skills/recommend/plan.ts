import type { CliCommandDefinition, CliExecutionContext } from "../../../contracts/cli.ts";
import type { ManagedSkillListItem } from "../managed-skill-listings.ts";
import type { CandidateResolution, RecommendationPartition } from "./recommendation-plan.ts";

import { z } from "zod";
import {
    getDismissedSkillRecommendations,
    isSkillRecommendationsMuted,
} from "../../../schemas/settings.ts";
import { compareSemver } from "../../../semver.ts";
import { bucketTelemetryCount } from "../../../telemetry/buckets.ts";
import { jsonOutputOptions, writeJsonOutput } from "../../json-output.ts";
import { resolveCurrentEndpoint } from "../../shared/auth-utils.ts";
import { createFormatInputError } from "../../shared/input-parsing.ts";
import { writeLine } from "../../shared/output.ts";
import { readKnownManagedSkillInstallations } from "../installed-managed-skills.ts";
import { resolveAvailableManagedSkillHosts } from "../managed-skill-hosts.ts";
import { loadRegistryPackageSkillInfoAllowingMissing } from "../registry-skill-source.ts";
import { createPackageNamesTelemetryProperties } from "../telemetry.ts";
import {
    dedupePreserveOrder,
    deriveSkillPackageName,
    partitionRecommendations,
} from "./recommendation-plan.ts";

const planFormatValues = ["json"] as const;
// The package-info endpoint has no rate limit, so a small fixed fan-out keeps
// the wrap-up snappy without hammering the registry.
const packageExistenceConcurrency = 3;

interface RecommendationPlan extends RecommendationPartition {
    muted: boolean;
}

type RemotePackageStatus
    = | { kind: "exists"; latestVersion: string }
        | { kind: "not-found" }
        | { kind: "lookup-failed" };

interface SkillsRecommendPlanInput {
    connectorServices?: string[];
    format?: (typeof planFormatValues)[number];
    showSchemaVersion?: boolean;
}

export const skillsRecommendPlanCommand: CliCommandDefinition<SkillsRecommendPlanInput> = {
    name: "plan",
    summaryKey: "commands.skills.recommend.plan.summary",
    descriptionKey: "commands.skills.recommend.plan.description",
    arguments: [
        {
            name: "connectorServices",
            descriptionKey: "arguments.skills.recommend.connectorService",
            required: false,
            variadic: true,
        },
    ],
    options: [...jsonOutputOptions],
    inputSchema: z.object({
        connectorServices: z.array(z.string()).optional(),
        format: z.enum(planFormatValues).optional(),
        showSchemaVersion: z.boolean().optional(),
    }),
    mapInputError: (_, rawInput) => createFormatInputError(rawInput),
    handler: async (input, context) => {
        // Each connector service maps to one published `oo-<service>` package.
        const packageNames = dedupePreserveOrder(
            (input.connectorServices ?? [])
                .map(service => service.trim())
                .filter(service => service.length > 0)
                .map(deriveSkillPackageName),
        );
        const settings = await context.settingsStore.read();
        const dismissed = new Set(getDismissedSkillRecommendations(settings));
        const muted = isSkillRecommendationsMuted(settings);

        const plan: RecommendationPlan = muted
            ? {
                    muted: true,
                    ...partitionRecommendations(
                        packageNames.map(packageName => ({
                            packageName,
                            resolution: { kind: "skip", reason: "muted" },
                        })),
                    ),
                }
            : {
                    muted: false,
                    ...partitionRecommendations(
                        await resolveCandidates(packageNames, dismissed, context),
                    ),
                };

        recordTelemetry(context, plan, packageNames);

        if (input.format === "json") {
            writeJsonOutput(context.stdout, plan, {
                showSchemaVersion: input.showSchemaVersion,
            });
            return;
        }

        writeText(context, plan);
    },
};

// Resolves each candidate package to install/update/skip. Dismissed packages
// short-circuit offline; every other package is confirmed against the registry
// (existence + latest version) with a bounded concurrency, and the local
// inventory decides install vs update vs up-to-date.
async function resolveCandidates(
    packageNames: readonly string[],
    dismissed: ReadonlySet<string>,
    context: CliExecutionContext,
): Promise<{ packageName: string; resolution: CandidateResolution }[]> {
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);
    const installedSkills = await readKnownManagedSkillInstallations(
        availableHosts,
        context.settingsStore.getFilePath(),
    );
    const installedVersionByPackage = collectInstalledRegistryVersions(installedSkills);

    const resolutionByPackage = new Map<string, CandidateResolution>();
    const remoteTargets: string[] = [];

    for (const packageName of packageNames) {
        if (dismissed.has(packageName)) {
            resolutionByPackage.set(packageName, { kind: "skip", reason: "dismissed" });
            continue;
        }

        remoteTargets.push(packageName);
    }

    // The package-info endpoint is public, so the existence check needs only
    // the endpoint, not a logged-in account.
    const endpoint = remoteTargets.length > 0
        ? await resolveCurrentEndpoint(context)
        : undefined;

    await mapWithConcurrency(
        remoteTargets,
        packageExistenceConcurrency,
        async (packageName) => {
            const status = await resolveRemotePackageStatus(
                packageName,
                endpoint as string,
                context,
            );

            resolutionByPackage.set(
                packageName,
                classifyCandidate(status, installedVersionByPackage.get(packageName)),
            );
        },
    );

    return packageNames.map(packageName => ({
        packageName,
        // Every package was assigned a resolution above.
        resolution: resolutionByPackage.get(packageName) as CandidateResolution,
    }));
}

function classifyCandidate(
    status: RemotePackageStatus,
    currentVersion: string | undefined,
): CandidateResolution {
    switch (status.kind) {
        case "not-found":
            return { kind: "skip", reason: "not-published" };
        case "lookup-failed":
            return { kind: "skip", reason: "lookup-failed" };
        case "exists":
            if (currentVersion === undefined) {
                return { kind: "install" };
            }

            return compareSemver(status.latestVersion, currentVersion) > 0
                ? {
                        kind: "update",
                        currentVersion,
                        latestVersion: status.latestVersion,
                    }
                : { kind: "skip", reason: "up-to-date" };
    }
}

async function resolveRemotePackageStatus(
    packageName: string,
    endpoint: string,
    context: CliExecutionContext,
): Promise<RemotePackageStatus> {
    try {
        const info = await loadRegistryPackageSkillInfoAllowingMissing(
            packageName,
            endpoint,
            context,
        );

        if (info === "not-found") {
            return { kind: "not-found" };
        }

        return { kind: "exists", latestVersion: info.packageVersion };
    }
    catch (error) {
        // The recommendation is best-effort: any lookup failure (server error,
        // network blip) degrades to a silent lookup-failed skip rather than
        // blocking the wrap-up.
        context.logger.warn(
            { err: error, packageName },
            "skills recommend plan package lookup failed.",
        );
        return { kind: "lookup-failed" };
    }
}

// Maps each installed registry package to its installed version. The first
// installed skill of a package wins when several skills share one package.
function collectInstalledRegistryVersions(
    installedSkills: readonly ManagedSkillListItem[],
): Map<string, string> {
    const installedVersionByPackage = new Map<string, string>();

    for (const skill of installedSkills) {
        if (
            skill.metadata?.kind === "registry"
            && !installedVersionByPackage.has(skill.metadata.packageName)
        ) {
            installedVersionByPackage.set(
                skill.metadata.packageName,
                skill.metadata.version,
            );
        }
    }

    return installedVersionByPackage;
}

// Runs `worker` over `items` with at most `limit` in flight at once.
async function mapWithConcurrency<T>(
    items: readonly T[],
    limit: number,
    worker: (item: T) => Promise<void>,
): Promise<void> {
    let nextIndex = 0;
    const runners = Array.from(
        { length: Math.min(limit, items.length) },
        async () => {
            while (true) {
                const index = nextIndex;

                nextIndex += 1;

                if (index >= items.length) {
                    return;
                }

                await worker(items[index] as T);
            }
        },
    );

    await Promise.all(runners);
}

function recordTelemetry(
    context: CliExecutionContext,
    plan: RecommendationPlan,
    packageNames: readonly string[],
): void {
    const installCount = plan.recommendations.filter(
        entry => entry.action === "install",
    ).length;
    const updateCount = plan.recommendations.filter(
        entry => entry.action === "update",
    ).length;

    context.telemetry?.recordProperties({
        muted: plan.muted,
        install_count_bucket: bucketTelemetryCount(installCount),
        update_count_bucket: bucketTelemetryCount(updateCount),
        skipped_count_bucket: bucketTelemetryCount(plan.skipped.length),
        ...createPackageNamesTelemetryProperties(packageNames),
    });
}

function writeText(
    context: CliExecutionContext,
    plan: RecommendationPlan,
): void {
    if (plan.muted) {
        writeLine(context.stdout, context.translator.t("skills.recommend.plan.muted"));
        return;
    }

    if (plan.recommendations.length === 0) {
        writeLine(context.stdout, context.translator.t("skills.recommend.plan.none"));
        return;
    }

    writeLine(context.stdout, context.translator.t("skills.recommend.plan.header"));

    for (const entry of plan.recommendations) {
        if (entry.action === "install") {
            writeLine(
                context.stdout,
                context.translator.t("skills.recommend.plan.installLine", {
                    packageName: entry.packageName,
                }),
            );
            continue;
        }

        writeLine(
            context.stdout,
            context.translator.t("skills.recommend.plan.updateLine", {
                packageName: entry.packageName,
                currentVersion: entry.currentVersion ?? "",
                latestVersion: entry.latestVersion ?? "",
            }),
        );
    }
}
