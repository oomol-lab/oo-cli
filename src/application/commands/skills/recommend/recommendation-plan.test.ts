import type { ResolvedCandidate } from "./recommendation-plan.ts";

import { describe, expect, test } from "bun:test";
import {
    dedupePreserveOrder,
    deriveSkillPackageName,
    partitionRecommendations,

} from "./recommendation-plan.ts";

describe("deriveSkillPackageName", () => {
    test("prefixes oo- for a single-word service", () => {
        expect(deriveSkillPackageName("github")).toBe("oo-github");
        expect(deriveSkillPackageName("gmail")).toBe("oo-gmail");
    });

    test("replaces underscores with hyphens", () => {
        expect(deriveSkillPackageName("aliyun_oss")).toBe("oo-aliyun-oss");
        expect(deriveSkillPackageName("asin_data_api")).toBe("oo-asin-data-api");
    });

    test("trims surrounding whitespace before deriving", () => {
        expect(deriveSkillPackageName("  github  ")).toBe("oo-github");
    });
});

describe("partitionRecommendations", () => {
    test("routes install and update resolutions into recommendations", () => {
        const candidates: ResolvedCandidate[] = [
            { packageName: "oo-gmail", resolution: { kind: "install" } },
            {
                packageName: "oo-notion",
                resolution: { kind: "update", currentVersion: "1.0.0", latestVersion: "2.0.0" },
            },
        ];

        const partition = partitionRecommendations(candidates);

        expect(partition.recommendations).toEqual([
            { packageName: "oo-gmail", action: "install" },
            {
                packageName: "oo-notion",
                action: "update",
                currentVersion: "1.0.0",
                latestVersion: "2.0.0",
            },
        ]);
        expect(partition.skipped).toEqual([]);
    });

    test("routes every skip reason into skipped", () => {
        const reasons = ["muted", "dismissed", "up-to-date", "not-published", "lookup-failed"] as const;
        const candidates: ResolvedCandidate[] = reasons.map((reason, index) => ({
            packageName: `oo-${index}`,
            resolution: { kind: "skip", reason },
        }));

        const partition = partitionRecommendations(candidates);

        expect(partition.recommendations).toEqual([]);
        expect(partition.skipped).toEqual([
            { packageName: "oo-0", reason: "muted" },
            { packageName: "oo-1", reason: "dismissed" },
            { packageName: "oo-2", reason: "up-to-date" },
            { packageName: "oo-3", reason: "not-published" },
            { packageName: "oo-4", reason: "lookup-failed" },
        ]);
    });

    test("preserves input order across recommendations and skips", () => {
        const candidates: ResolvedCandidate[] = [
            { packageName: "a", resolution: { kind: "install" } },
            { packageName: "b", resolution: { kind: "skip", reason: "not-published" } },
            {
                packageName: "c",
                resolution: { kind: "update", currentVersion: "1.0.0", latestVersion: "1.1.0" },
            },
        ];

        const partition = partitionRecommendations(candidates);

        expect(partition.recommendations.map(entry => entry.packageName)).toEqual(["a", "c"]);
        expect(partition.skipped.map(entry => entry.packageName)).toEqual(["b"]);
    });
});

describe("dedupePreserveOrder", () => {
    test("removes duplicates while preserving first-seen order", () => {
        expect(dedupePreserveOrder(["b", "a", "b", "c", "a"])).toEqual(["b", "a", "c"]);
    });

    test("returns an empty array for empty input", () => {
        expect(dedupePreserveOrder([])).toEqual([]);
    });
});
