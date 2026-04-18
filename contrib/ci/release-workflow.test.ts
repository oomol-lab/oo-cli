import { describe, expect, test } from "bun:test";

import {
    buildCreateReleaseCommand,
    preparePackageManifest,
} from "./release-steps.ts";

describe("release-workflow", () => {
    test("prepares the package manifest for publishing", () => {
        const nextManifest = preparePackageManifest(
            JSON.stringify({
                name: "oo",
                version: "0.0.0-development",
                private: true,
            }),
            "1.2.3",
        );

        expect(JSON.parse(nextManifest)).toEqual({
            name: "oo",
            version: "1.2.3",
            private: false,
        });
        expect(nextManifest.endsWith("\n")).toBeTrue();
    });

    test("rejects an empty release version", () => {
        expect(() =>
            preparePackageManifest(
                JSON.stringify({
                    name: "oo",
                    version: "0.0.0-development",
                    private: true,
                }),
                "",
            ),
        ).toThrow("RELEASE_VERSION is required.");
    });

    test("builds the gh release command with a previous tag", () => {
        expect(
            buildCreateReleaseCommand({
                releaseTag: "v1.2.3",
                previousTag: "v1.2.2",
                target: "abc123",
                assets: [
                    "dist/oo-1.2.3.tgz",
                    "dist/oo-binaries.tgz",
                ],
            }),
        ).toEqual([
            "gh",
            "release",
            "create",
            "v1.2.3",
            "dist/oo-1.2.3.tgz",
            "dist/oo-binaries.tgz",
            "--target",
            "abc123",
            "--title",
            "v1.2.3",
            "--generate-notes",
            "--notes-start-tag",
            "v1.2.2",
            "--latest",
        ]);
    });

    test("builds the gh release command without a previous tag", () => {
        expect(
            buildCreateReleaseCommand({
                releaseTag: "v1.2.3",
                previousTag: "",
                target: "abc123",
                assets: [
                    "dist/oo-1.2.3.tgz",
                    "dist/oo-binaries.tgz",
                ],
            }),
        ).toEqual([
            "gh",
            "release",
            "create",
            "v1.2.3",
            "dist/oo-1.2.3.tgz",
            "dist/oo-binaries.tgz",
            "--target",
            "abc123",
            "--title",
            "v1.2.3",
            "--generate-notes",
            "--latest",
        ]);
    });

    test("rejects release commands without assets", () => {
        expect(() =>
            buildCreateReleaseCommand({
                releaseTag: "v1.2.3",
                previousTag: "",
                target: "abc123",
                assets: [],
            }),
        ).toThrow("At least one release asset is required.");
    });
});
