import type { RecommendationCooldownGate } from "./recommendation-cooldown.ts";

import type { RecommendationEntry, RecommendationPartition } from "./recommendation-plan.ts";
import { describe, expect, test } from "bun:test";
import {
    applyRecommendationCooldown,
    buildRecommendationCooldownKey,
} from "./recommendation-cooldown.ts";

describe("buildRecommendationCooldownKey", () => {
    test("keys an install on the package and action with an empty version target", () => {
        const key = buildRecommendationCooldownKey({
            packageName: "oo-monday",
            action: "install",
        });

        expect(key).toBe("oo-monday|install|");
    });

    test("keys an update on the current and latest version so content changes re-surface", () => {
        const key = buildRecommendationCooldownKey({
            packageName: "oo-monday",
            action: "update",
            currentVersion: "1.0.0",
            latestVersion: "2.0.0",
        });

        expect(key).toBe("oo-monday|update|1.0.0->2.0.0");
    });

    test("install and update of the same package produce distinct keys", () => {
        const install = buildRecommendationCooldownKey({
            packageName: "oo-monday",
            action: "install",
        });
        const update = buildRecommendationCooldownKey({
            packageName: "oo-monday",
            action: "update",
            currentVersion: "1.0.0",
            latestVersion: "2.0.0",
        });

        expect(install).not.toBe(update);
    });
});

describe("applyRecommendationCooldown", () => {
    test("passes through and marks a first-time recommendation", () => {
        const gate = createFakeGate();
        const partition = partitionOf([
            { packageName: "oo-monday", action: "install" },
        ]);

        const result = applyRecommendationCooldown(partition, gate);

        expect(result.recommendations).toEqual(partition.recommendations);
        expect(result.skipped).toEqual([]);
        expect(gate.marked).toEqual(["oo-monday|install|"]);
    });

    test("demotes a recommendation surfaced again within the window to a recently-suggested skip", () => {
        const gate = createFakeGate();
        const partition = partitionOf([
            { packageName: "oo-monday", action: "install" },
        ]);

        applyRecommendationCooldown(partition, gate);
        const second = applyRecommendationCooldown(partition, gate);

        expect(second.recommendations).toEqual([]);
        expect(second.skipped).toEqual([
            { packageName: "oo-monday", reason: "recently-suggested" },
        ]);
    });

    test("force bypasses suppression but still refreshes the stamp", () => {
        const gate = createFakeGate();
        const partition = partitionOf([
            { packageName: "oo-monday", action: "install" },
        ]);

        applyRecommendationCooldown(partition, gate);
        const forced = applyRecommendationCooldown(partition, gate, { force: true });
        const afterForce = applyRecommendationCooldown(partition, gate);

        expect(forced.recommendations).toEqual(partition.recommendations);
        expect(forced.skipped).toEqual([]);
        // The forced run re-stamped the key, so the next un-forced run suppresses.
        expect(afterForce.recommendations).toEqual([]);
        expect(afterForce.skipped).toEqual([
            { packageName: "oo-monday", reason: "recently-suggested" },
        ]);
    });

    test("a content change re-surfaces even after the install was suggested", () => {
        const gate = createFakeGate();

        applyRecommendationCooldown(
            partitionOf([{ packageName: "oo-monday", action: "install" }]),
            gate,
        );
        const afterChange = applyRecommendationCooldown(
            partitionOf([
                {
                    packageName: "oo-monday",
                    action: "update",
                    currentVersion: "1.0.0",
                    latestVersion: "2.0.0",
                },
            ]),
            gate,
        );

        expect(afterChange.recommendations).toEqual([
            {
                packageName: "oo-monday",
                action: "update",
                currentVersion: "1.0.0",
                latestVersion: "2.0.0",
            },
        ]);
        expect(afterChange.skipped).toEqual([]);
    });

    test("preserves resolved skips and appends cooldown demotions, keeping order", () => {
        const gate = createFakeGate(["oo-gmail|install|"]);
        const partition: RecommendationPartition = {
            recommendations: [
                { packageName: "oo-gmail", action: "install" },
                { packageName: "oo-notion", action: "install" },
            ],
            skipped: [{ packageName: "oo-drive", reason: "up-to-date" }],
        };

        const result = applyRecommendationCooldown(partition, gate);

        expect(result.recommendations).toEqual([
            { packageName: "oo-notion", action: "install" },
        ]);
        expect(result.skipped).toEqual([
            { packageName: "oo-drive", reason: "up-to-date" },
            { packageName: "oo-gmail", reason: "recently-suggested" },
        ]);
    });
});

interface FakeGate extends RecommendationCooldownGate {
    marked: string[];
}

function createFakeGate(initial: readonly string[] = []): FakeGate {
    const seen = new Set<string>(initial);
    const marked: string[] = [];

    return {
        marked,
        wasRecentlySuggested: key => seen.has(key),
        markSuggested: (key) => {
            seen.add(key);
            marked.push(key);
        },
    };
}

function partitionOf(
    recommendations: readonly RecommendationEntry[],
): RecommendationPartition {
    return { recommendations: [...recommendations], skipped: [] };
}
