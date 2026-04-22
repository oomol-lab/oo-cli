import { describe, expect, test } from "bun:test";

import { resolveBuildReleaseVersionFromEnvironment } from "./build-platform-npm-packages.ts";

describe("build-platform-npm-packages", () => {
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
