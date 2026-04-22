import { describe, expect, test } from "bun:test";

import { resolveBuildReleaseVersionFromEnvironment } from "./build-platform-npm-packages.ts";
import { resolveBuildTargetIdsForSelection } from "./npm-packages.ts";

describe("build-platform-npm-packages", () => {
    test("resolves platform presets to all matching build targets", () => {
        expect(resolveBuildTargetIdsForSelection("windows")).toEqual([
            "win32-arm64",
            "win32-x64",
        ]);
    });

    test("resolves explicit build targets without expanding other architectures", () => {
        expect(resolveBuildTargetIdsForSelection("win32-x64")).toEqual([
            "win32-x64",
        ]);
        expect(resolveBuildTargetIdsForSelection("win32-arm64")).toEqual([
            "win32-arm64",
        ]);
    });

    test("rejects an empty build target selection", () => {
        expect(() => resolveBuildTargetIdsForSelection(undefined)).toThrow(
            "Build target selection is required.",
        );
    });

    test("prefers RELEASE_VERSION when both release env variables are present", () => {
        expect(
            resolveBuildReleaseVersionFromEnvironment({
                BUILD_VERSION: "1.2.2",
                RELEASE_VERSION: "1.2.3",
            }),
        ).toBe("1.2.3");
    });

    test("falls back to BUILD_VERSION for local package staging", () => {
        expect(
            resolveBuildReleaseVersionFromEnvironment({
                BUILD_VERSION: "1.2.3",
            }),
        ).toBe("1.2.3");
    });

    test("returns undefined when no release version override is configured", () => {
        expect(resolveBuildReleaseVersionFromEnvironment({})).toBeUndefined();
    });
});
