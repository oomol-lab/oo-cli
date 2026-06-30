// Session-level de-duplication for the wrap-up skill recommendation. The CLI has
// no stable cross-invocation session id (each process mints a fresh one), so a
// "session" is approximated by a time-window cooldown: once a recommendation is
// surfaced, the same recommendation is suppressed on later runs until the window
// lapses. This keeps an agent that re-runs the wrap-up after every task from
// re-appending the identical suggestion every turn.
//
// All persistence (the TTL store) lives in the command handler; this module is a
// pure transform over a resolved partition so it stays testable in isolation.

import type { RecommendationEntry, RecommendationPartition } from "./recommendation-plan.ts";

// Gate over the cooldown store. `wasRecentlySuggested` reports whether the key is
// still inside its window; `markSuggested` (re)stamps it so an active session
// keeps the suggestion suppressed for the whole session.
export interface RecommendationCooldownGate {
    wasRecentlySuggested: (key: string) => boolean;
    markSuggested: (key: string) => void;
}

export interface ApplyRecommendationCooldownOptions {
    // Bypass suppression (the explicit "the user asked to see it again" path).
    // The stamp is still refreshed so the next un-forced run suppresses again.
    force?: boolean;
}

// Builds the cooldown key for a recommendation. Keying on the version target as
// well as the package and action makes the legitimate re-surface triggers fall
// out for free: a different package, or a content change (install -> update, or a
// newer latest version), yields a different key and surfaces again.
export function buildRecommendationCooldownKey(
    entry: RecommendationEntry,
): string {
    const versionTarget = entry.action === "update"
        ? `${entry.currentVersion ?? ""}->${entry.latestVersion ?? ""}`
        : "";

    return `${entry.packageName}|${entry.action}|${versionTarget}`;
}

// Demotes recommendations that were already surfaced within the cooldown window
// to skips (reason `recently-suggested`), preserving input order, and stamps
// every surfaced (or force-surfaced) entry so an active session stays quiet.
export function applyRecommendationCooldown(
    partition: RecommendationPartition,
    gate: RecommendationCooldownGate,
    options: ApplyRecommendationCooldownOptions = {},
): RecommendationPartition {
    const force = options.force === true;
    const recommendations: RecommendationEntry[] = [];
    const suppressed: RecommendationPartition["skipped"] = [];

    for (const entry of partition.recommendations) {
        const key = buildRecommendationCooldownKey(entry);
        const recentlySuggested = gate.wasRecentlySuggested(key);

        // Refresh the stamp on every active run so a long session never repeats.
        gate.markSuggested(key);

        if (!force && recentlySuggested) {
            suppressed.push({
                packageName: entry.packageName,
                reason: "recently-suggested",
            });
            continue;
        }

        recommendations.push(entry);
    }

    return {
        recommendations,
        // Resolved skips keep their order; cooldown demotions follow them.
        skipped: [...partition.skipped, ...suppressed],
    };
}
