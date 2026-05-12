import process from "node:process";

import { afterEach, describe, expect, test } from "bun:test";

import {
    buildCreateReleaseCommand,
    buildFeishuReleaseFollowupNotification,
    buildFeishuReleaseNotification,
    buildUploadReleaseAssetsCommand,
    preparePackageManifest,
} from "./release-steps.ts";
import { main } from "./release-workflow.ts";

const originalFetch = globalThis.fetch;
const originalSpawn = Bun.spawn;
const originalEnv = process.env;

afterEach(() => {
    globalThis.fetch = originalFetch;
    Bun.spawn = originalSpawn;
    process.env = originalEnv;
});

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

    test("builds the gh release upload command with clobber", () => {
        expect(
            buildUploadReleaseAssetsCommand({
                releaseTag: "v1.2.3",
                assets: [
                    "dist/oo-1.2.3.tgz",
                    "dist/oo-binaries.tgz",
                ],
            }),
        ).toEqual([
            "gh",
            "release",
            "upload",
            "v1.2.3",
            "dist/oo-1.2.3.tgz",
            "dist/oo-binaries.tgz",
            "--clobber",
        ]);
    });

    test("creates a GitHub release when the tag does not exist", async () => {
        const requests = installReleaseFetchStub({ kind: "missing" });
        const spawnCalls = installSpawnStub();
        process.env = {
            GH_TOKEN: "token",
            GITHUB_REPOSITORY: "oomol-lab/oo-cli",
            GITHUB_SHA: "abc123",
            PREVIOUS_TAG: "v1.2.2",
            RELEASE_TAG: "v1.2.3",
        } as NodeJS.ProcessEnv;

        await main([
            "create-github-release",
            "dist/oo-1.2.3.tgz",
            "dist/oo-binaries.tgz",
        ]);

        expect(requests).toEqual([{
            init: expect.objectContaining({
                headers: expect.objectContaining({
                    authorization: "Bearer token",
                }),
            }),
            url: "https://api.github.com/repos/oomol-lab/oo-cli/releases/tags/v1.2.3",
        }]);
        expect(spawnCalls).toEqual([[
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
        ]]);
    });

    test("uploads release assets when the tag already exists", async () => {
        const requests = installReleaseFetchStub({ kind: "exists" });
        const spawnCalls = installSpawnStub();
        process.env = {
            GH_TOKEN: "token",
            GITHUB_REPOSITORY: "oomol-lab/oo-cli",
            GITHUB_SHA: "abc123",
            PREVIOUS_TAG: "v1.2.2",
            RELEASE_TAG: "v1.2.3",
        } as NodeJS.ProcessEnv;

        await main([
            "create-github-release",
            "dist/oo-1.2.3.tgz",
            "dist/oo-binaries.tgz",
        ]);

        expect(requests).toEqual([{
            init: expect.objectContaining({
                headers: expect.objectContaining({
                    authorization: "Bearer token",
                }),
            }),
            url: "https://api.github.com/repos/oomol-lab/oo-cli/releases/tags/v1.2.3",
        }]);
        expect(spawnCalls).toEqual([[
            "gh",
            "release",
            "upload",
            "v1.2.3",
            "dist/oo-1.2.3.tgz",
            "dist/oo-binaries.tgz",
            "--clobber",
        ]]);
    });

    test("throws when the GitHub releases lookup fails with a non-404 error", async () => {
        installReleaseFetchStub({
            kind: "error",
            status: 500,
            statusText: "Internal Server Error",
        });
        const spawnCalls = installSpawnStub();
        process.env = {
            GH_TOKEN: "token",
            GITHUB_REPOSITORY: "oomol-lab/oo-cli",
            GITHUB_SHA: "abc123",
            RELEASE_TAG: "v1.2.3",
        } as NodeJS.ProcessEnv;

        await expect(main([
            "create-github-release",
            "dist/oo-1.2.3.tgz",
        ])).rejects.toThrow(/GitHub API request failed: 500/);
        expect(spawnCalls).toEqual([]);
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

type FetchInit = Parameters<typeof fetch>[1];

interface CapturedFetchRequest {
    init: FetchInit;
    url: string;
}

type ReleaseFetchStubOptions
    = | { kind: "exists" }
        | { kind: "missing" }
        | { kind: "error"; status: number; statusText: string };

function installReleaseFetchStub(options: ReleaseFetchStubOptions): CapturedFetchRequest[] {
    const requests: CapturedFetchRequest[] = [];

    globalThis.fetch = Object.assign(async (
        input: Parameters<typeof fetch>[0],
        init?: FetchInit,
    ): Promise<Response> => {
        const url = String(input);
        requests.push({
            init,
            url,
        });

        if (url.includes("/releases/tags/v1.2.3")) {
            switch (options.kind) {
                case "exists":
                    return Response.json({ tag_name: "v1.2.3" });
                case "missing":
                    return Response.json({ message: "Not Found" }, {
                        status: 404,
                        statusText: "Not Found",
                    });
                case "error":
                    return Response.json({ message: "boom" }, {
                        status: options.status,
                        statusText: options.statusText,
                    });
            }
        }

        return Response.json({});
    }, {
        preconnect: originalFetch.preconnect,
    });

    return requests;
}

function installSpawnStub(): string[][] {
    const spawnCalls: string[][] = [];

    Bun.spawn = ((command: string[]) => {
        spawnCalls.push(command);

        return {
            exited: Promise.resolve(0),
            kill: () => 0,
            unref: () => {},
        } as unknown as ReturnType<typeof Bun.spawn>;
    }) as typeof Bun.spawn;

    return spawnCalls;
}
