import { describe, expect, test } from "bun:test";

import {
    bumpVersion,
    computeReleaseVersion,
    findLatestStableTag,
    formatGitHubOutput,
    isStableSemver,
    normalizeExpectedVersion,
    parseStableTag,
    readVersionBump,
} from "./release-version.ts";

describe("compute-release-version", () => {
    test("validates stable semver strings", () => {
        expect(isStableSemver("1.2.3")).toBeTrue();
        expect(isStableSemver("1.2")).toBeFalse();
        expect(isStableSemver("1.2.3-beta.1")).toBeFalse();
    });

    test("parses stable tags only", () => {
        expect(parseStableTag("v1.2.3")).toBe("1.2.3");
        expect(parseStableTag("1.2.3")).toBeUndefined();
        expect(parseStableTag("v1.2.3-beta.1")).toBeUndefined();
    });

    test("normalizes an explicit version with or without a v prefix", () => {
        expect(normalizeExpectedVersion("1.2.3")).toBe("1.2.3");
        expect(normalizeExpectedVersion("v1.2.3")).toBe("1.2.3");
    });

    test("rejects explicit versions that are not stable semver", () => {
        expect(() => normalizeExpectedVersion("1.2")).toThrow(
            "Expected version must use the X.Y.Z format.",
        );
    });

    test("finds the latest stable tag from a sorted tag list", () => {
        expect(findLatestStableTag(["v2.0.0-beta.1", "v1.4.0", "v1.3.9"])).toBe("v1.4.0");
        expect(findLatestStableTag(["foo", "bar"])).toBe("");
    });

    test("bumps the latest stable tag when no explicit version is provided", () => {
        expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
        expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
        expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
    });

    test("computes the next patch version from existing tags", () => {
        expect(
            computeReleaseVersion({
                expectedVersion: "",
                versionBump: "patch",
                tags: ["v1.2.3", "v1.2.2"],
            }),
        ).toEqual({
            version: "1.2.4",
            tagName: "v1.2.4",
            previousTag: "v1.2.3",
        });
    });

    test("falls back to 0.0.1 when there are no existing stable tags", () => {
        expect(
            computeReleaseVersion({
                expectedVersion: "",
                versionBump: "patch",
                tags: [],
            }),
        ).toEqual({
            version: "0.0.1",
            tagName: "v0.0.1",
            previousTag: "",
        });
    });

    test("uses the explicit version when provided", () => {
        expect(
            computeReleaseVersion({
                expectedVersion: "v2.0.0",
                versionBump: "patch",
                tags: ["v1.2.3"],
            }),
        ).toEqual({
            version: "2.0.0",
            tagName: "v2.0.0",
            previousTag: "v1.2.3",
        });
    });

    test("rejects existing tags", () => {
        expect(() =>
            computeReleaseVersion({
                expectedVersion: "1.2.3",
                versionBump: "patch",
                tags: ["v1.2.3"],
            }),
        ).toThrow("Tag v1.2.3 already exists.");
    });

    test("reads the version bump from the workflow input", () => {
        expect(readVersionBump("patch")).toBe("patch");
        expect(() => readVersionBump("prerelease")).toThrow(
            "Unsupported version bump: prerelease",
        );
    });

    test("formats GitHub outputs", () => {
        expect(
            formatGitHubOutput({
                version: "1.2.3",
                tagName: "v1.2.3",
                previousTag: "v1.2.2",
            }),
        ).toBe("version=1.2.3\ntag_name=v1.2.3\nprevious_tag=v1.2.2\n");
    });
});
