import type { Cache } from "../../../contracts/cache.ts";
import type { CliCommandDefinition, CliExecutionContext } from "../../../contracts/cli.ts";
import type { InstalledSkill } from "../installed-skills.ts";
import type { RecommendationCooldownGate } from "./recommendation-cooldown.ts";
import type { CandidateResolution, RecommendationPartition } from "./recommendation-plan.ts";

import { z } from "zod";
import { resolveIdentity } from "../../../auth/identity.ts";
import {
    getDismissedSkillRecommendations,
    isSkillRecommendationsMuted,
} from "../../../schemas/settings.ts";
import { compareSemver } from "../../../semver.ts";
import { bucketTelemetryCount } from "../../../telemetry/buckets.ts";
import { writeLine } from "../../shared/output.ts";
import {
    groupInstalledSkillsByPackageName,
    readInstalledSkills,
} from "../installed-skills.ts";
import { loadRegistryPackageSkillInfoAllowingMissing } from "../registry-skill-source.ts";
import { createPackageNamesTelemetryProperties } from "../telemetry.ts";
import { applyRecommendationCooldown } from "./recommendation-cooldown.ts";
import {
    deriveSkillPackageName,
    partitionRecommendations,
} from "./recommendation-plan.ts";

// The package-info endpoint has no rate limit, so a small fixed fan-out keeps
// the wrap-up snappy without hammering the registry.
const packageExistenceConcurrency = 3;
// The recommendation cooldown approximates "one session": once a suggestion is
// surfaced, it is suppressed for this window so an agent that re-runs the wrap-up
// after every task does not re-append the identical prompt every turn. The
// window is long enough to span a continuous working session and short enough
// that a genuinely new session later re-surfaces the suggestion.
const recommendationCooldownCacheId = "skills-recommend-cooldown";
const recommendationCooldownTtlMs = 4 * 60 * 60 * 1000;
const recommendationCooldownMaxEntries = 256;

interface RecommendationPlan extends RecommendationPartition {
    muted: boolean;
}

type RemotePackageStatus
    = | { kind: "exists"; latestVersion: string }
        | { kind: "not-found" }
        | { kind: "lookup-failed" };

interface SkillsRecommendPlanInput {
    connectorServices?: string[];
    force?: boolean;
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
    options: [
        {
            name: "force",
            longFlag: "--force",
            descriptionKey: "options.skills.recommend.plan.force",
        },
    ],
    output: "standard",
    inputSchema: z.object({
        connectorServices: z.array(z.string()).optional(),
        force: z.boolean().optional(),
    }),
    handler: async (input, context) => {
        // Each connector service maps to one published `oo-<service>` package.
        const packageNames = [...new Set(
            (input.connectorServices ?? [])
                .map(service => service.trim())
                .filter(service => service.length > 0)
                .map(deriveSkillPackageName),
        )];
        const settings = await context.settingsStore.read();
        const dismissed = new Set(getDismissedSkillRecommendations(settings));
        const muted = isSkillRecommendationsMuted(settings);

        const resolvedPlan: RecommendationPlan = muted
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

        // Muted plans surface nothing, so they neither read nor stamp the
        // cooldown. Every other plan is de-duplicated against the per-session
        // cooldown window before it reaches the user.
        const { plan, cooldownSuppressedCount } = muted
            ? { plan: resolvedPlan, cooldownSuppressedCount: 0 }
            : applySessionCooldown(resolvedPlan, input.force === true, context);

        // Muted plans skip the cooldown entirely, so `--force` bypasses nothing
        // there; only report a force when the cooldown actually ran.
        recordTelemetry(context, plan, packageNames, {
            forced: !muted && input.force === true,
            cooldownSuppressedCount,
        });

        context.output.emit(plan, () => {
            writeText(context, plan);
        });
    },
};

// Applies the per-session cooldown to a resolved (non-muted) plan: recommendations
// already surfaced within the window are demoted to `recently-suggested` skips.
// The cooldown is best-effort — if the cache is unavailable the plan passes
// through unchanged, preserving the pre-cooldown behavior rather than failing.
function applySessionCooldown(
    plan: RecommendationPlan,
    force: boolean,
    context: CliExecutionContext,
): { plan: RecommendationPlan; cooldownSuppressedCount: number } {
    if (plan.recommendations.length === 0) {
        return { plan, cooldownSuppressedCount: 0 };
    }

    try {
        const gate = createRecommendationCooldownGate(context);
        const gated = applyRecommendationCooldown(plan, gate, { force });

        return {
            plan: { muted: false, ...gated },
            cooldownSuppressedCount:
                plan.recommendations.length - gated.recommendations.length,
        };
    }
    catch (error) {
        context.logger.warn(
            { err: error },
            "skills recommend plan cooldown unavailable; surfacing without de-duplication.",
        );
        return { plan, cooldownSuppressedCount: 0 };
    }
}

function createRecommendationCooldownGate(
    context: Pick<CliExecutionContext, "cacheStore">,
): RecommendationCooldownGate {
    const cache: Cache<number> = context.cacheStore.getCache<number>({
        defaultTtlMs: recommendationCooldownTtlMs,
        id: recommendationCooldownCacheId,
        maxEntries: recommendationCooldownMaxEntries,
    });

    return {
        wasRecentlySuggested: key => cache.has(key),
        markSuggested: (key) => {
            cache.set(key, 1);
        },
    };
}

// Resolves each candidate package to install/update/skip. Dismissed packages
// short-circuit offline; every other package is confirmed against the registry
// (existence + latest version) with a bounded concurrency, and the local
// inventory decides install vs update vs up-to-date.
async function resolveCandidates(
    packageNames: readonly string[],
    dismissed: ReadonlySet<string>,
    context: CliExecutionContext,
): Promise<{ packageName: string; resolution: CandidateResolution }[]> {
    const installedSkills = await readInstalledSkills(
        context.env,
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
        ? (await resolveIdentity(context)).endpoint
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
    installedSkills: readonly InstalledSkill[],
): Map<string, string> {
    const installedVersionByPackage = new Map<string, string>();

    for (const [packageName, skills] of groupInstalledSkillsByPackageName(installedSkills)) {
        const version = skills[0]?.version;

        if (version !== undefined) {
            installedVersionByPackage.set(packageName, version);
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
    cooldown: { forced: boolean; cooldownSuppressedCount: number },
): void {
    const installCount = plan.recommendations.filter(
        entry => entry.action === "install",
    ).length;
    const updateCount = plan.recommendations.filter(
        entry => entry.action === "update",
    ).length;

    context.telemetry?.recordProperties({
        muted: plan.muted,
        forced: cooldown.forced,
        install_count_bucket: bucketTelemetryCount(installCount),
        update_count_bucket: bucketTelemetryCount(updateCount),
        skipped_count_bucket: bucketTelemetryCount(plan.skipped.length),
        cooldown_suppressed_count_bucket: bucketTelemetryCount(
            cooldown.cooldownSuppressedCount,
        ),
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
