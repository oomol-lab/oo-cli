// Pure helpers for the `oo skills recommend plan` command. All I/O (settings,
// installed inventory, registry existence/version lookups) is resolved by the
// command handler and reduced to per-candidate resolutions here, so this stays
// testable in isolation.

export type RecommendationAction = "install" | "update";

export type RecommendationSkipReason
    = | "muted"
        | "dismissed"
        | "up-to-date"
        | "not-published"
        | "lookup-failed"
        | "recently-suggested";

export interface RecommendationEntry {
    packageName: string;
    action: RecommendationAction;
    currentVersion?: string;
    latestVersion?: string;
}

export interface SkippedRecommendation {
    packageName: string;
    reason: RecommendationSkipReason;
}

export interface RecommendationPartition {
    recommendations: RecommendationEntry[];
    skipped: SkippedRecommendation[];
}

// A candidate package's fully resolved outcome.
export type CandidateResolution
    = | { kind: "install" }
        | { kind: "update"; currentVersion: string; latestVersion: string }
        | { kind: "skip"; reason: RecommendationSkipReason };

export interface ResolvedCandidate {
    packageName: string;
    resolution: CandidateResolution;
}

// Derives the published skill package name for a connector service, following
// the catalog convention: prepend `oo-` and replace underscores with hyphens
// (so `aliyun_oss` -> `oo-aliyun-oss`, `github` -> `oo-github`).
export function deriveSkillPackageName(connectorService: string): string {
    return `oo-${connectorService.trim().replaceAll("_", "-")}`;
}

// Splits resolved candidates into install/update suggestions and skips,
// preserving input order.
export function partitionRecommendations(
    candidates: readonly ResolvedCandidate[],
): RecommendationPartition {
    const recommendations: RecommendationEntry[] = [];
    const skipped: SkippedRecommendation[] = [];

    for (const candidate of candidates) {
        switch (candidate.resolution.kind) {
            case "install":
                recommendations.push({
                    packageName: candidate.packageName,
                    action: "install",
                });
                break;
            case "update":
                recommendations.push({
                    packageName: candidate.packageName,
                    action: "update",
                    currentVersion: candidate.resolution.currentVersion,
                    latestVersion: candidate.resolution.latestVersion,
                });
                break;
            case "skip":
                skipped.push({
                    packageName: candidate.packageName,
                    reason: candidate.resolution.reason,
                });
                break;
        }
    }

    return { recommendations, skipped };
}

// De-duplicates strings while preserving first-seen order.
export function dedupePreserveOrder(values: readonly string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        if (!seen.has(value)) {
            seen.add(value);
            result.push(value);
        }
    }

    return result;
}
