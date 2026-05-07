import { describe, expect, test } from "bun:test";

import {
    buildCreateReleaseCommand,
    buildFeishuReleaseFollowupNotification,
    buildFeishuReleaseNotification,
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

    test("builds the Feishu release notification payload", () => {
        expect(JSON.parse(buildFeishuReleaseNotification(createFeishuInput()))).toEqual({
            msg_type: "text",
            content: {
                text: [
                    "oo-cli v1.2.3 已发布",
                    "",
                    "版本：1.2.3",
                    "npm：https://www.npmjs.com/package/@oomol-lab/oo-cli/v/1.2.3",
                    "Release：https://github.com/oomol-lab/oo-cli/releases/tag/v1.2.3",
                    "Workflow：https://github.com/oomol-lab/oo-cli/actions/runs/123456789",
                ].join("\n"),
            },
        });
    });

    test("builds the signed Feishu release notification payload", () => {
        expect(JSON.parse(buildFeishuReleaseNotification(createFeishuInput({
            timestamp: "1710000000",
            sign: "signature",
        })))).toMatchObject({
            timestamp: "1710000000",
            sign: "signature",
            msg_type: "text",
        });
    });

    test("builds the Feishu release follow-up notification payload", () => {
        expect(JSON.parse(buildFeishuReleaseFollowupNotification({
            atUserId: "ou_followup_bot",
        }))).toEqual({
            msg_type: "text",
            content: {
                text: "<at user_id=\"ou_followup_bot\">follow-up bot</at> 更新 oo-cli",
            },
        });
    });

    test("builds the signed Feishu release follow-up notification payload", () => {
        expect(JSON.parse(buildFeishuReleaseFollowupNotification({
            atUserId: "ou_\"bot&reviewer",
            timestamp: "1710000000",
            sign: "signature",
        }))).toEqual({
            timestamp: "1710000000",
            sign: "signature",
            msg_type: "text",
            content: {
                text: "<at user_id=\"ou_&quot;bot&amp;reviewer\">follow-up bot</at> 更新 oo-cli",
            },
        });
    });

    test("rejects Feishu follow-up notifications without an at user id", () => {
        expect(() =>
            buildFeishuReleaseFollowupNotification({
                atUserId: "",
            }),
        ).toThrow("FEISHU_RELEASE_FOLLOWUP_AT_USER_ID is required.");
    });

    test("rejects Feishu notifications without a release tag", () => {
        expect(() =>
            buildFeishuReleaseNotification(createFeishuInput({ releaseTag: "" })),
        ).toThrow("RELEASE_TAG is required.");
    });
});

function createFeishuInput(overrides: Partial<Parameters<typeof buildFeishuReleaseNotification>[0]> = {}): Parameters<typeof buildFeishuReleaseNotification>[0] {
    return {
        releaseVersion: "1.2.3",
        releaseTag: "v1.2.3",
        repository: "oomol-lab/oo-cli",
        serverUrl: "https://github.com",
        runId: "123456789",
        ...overrides,
    };
}
