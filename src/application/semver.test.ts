import { describe, expect, test } from "bun:test";

import { compareSemver, isSemver } from "./semver.ts";

describe("semver", () => {
    test("accepts valid semver strings and rejects invalid ones", () => {
        expect(isSemver("1.2.3")).toBe(true);
        expect(isSemver("1.2.3-beta.1+build.09")).toBe(true);
        expect(isSemver("1.2")).toBe(false);
        expect(isSemver("1.2.3-beta.01")).toBe(false);
    });

    test("compares stable, prerelease, and invalid versions", () => {
        expect(compareSemver("1.2.4", "1.2.3")).toBe(1);
        expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
        expect(compareSemver("1.2.3", "1.2.3-beta.1")).toBe(1);
        expect(compareSemver("1.2.3-beta.2", "1.2.3-beta.10")).toBe(-1);
        expect(compareSemver("invalid", "1.2.3")).toBe(0);
    });
});
