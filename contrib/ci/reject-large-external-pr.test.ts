import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";

import {
    buildLargeExternalPullRequestRejectionComment,
    evaluateLargeExternalPullRequest,
    main,
} from "./reject-large-external-pr.ts";

const originalFetch = globalThis.fetch;
type FetchInit = Parameters<typeof fetch>[1];

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe("reject-large-external-pr", () => {
    test("rejects non organization members at the diff limit", () => {
        expect(evaluateLargeExternalPullRequest({
            additions: 120,
            authorIsOrganizationMember: false,
            deletions: 80,
        })).toEqual({
            diffLimit: 200,
            diffSize: 200,
            shouldReject: true,
        });
    });

    test("allows non organization members below the diff limit", () => {
        expect(evaluateLargeExternalPullRequest({
            additions: 120,
            authorIsOrganizationMember: false,
            deletions: 79,
        }).shouldReject).toBeFalse();
    });

    test("allows organization members above the diff limit", () => {
        expect(evaluateLargeExternalPullRequest({
            additions: 500,
            authorIsOrganizationMember: true,
            deletions: 500,
        })).toEqual({
            diffLimit: 200,
            diffSize: 1000,
            shouldReject: false,
        });
    });

    test("uses absolute additions and deletions for diff size", () => {
        expect(evaluateLargeExternalPullRequest({
            additions: -120,
            authorIsOrganizationMember: false,
            deletions: -80,
        })).toMatchObject({
            diffSize: 200,
            shouldReject: true,
        });
    });

    test("builds an idempotent rejection comment that points contributors to issues", () => {
        const comment = buildLargeExternalPullRequestRejectionComment({
            additions: 120,
            deletions: 80,
            diffLimit: 200,
        });

        expect(comment).toContain("<!-- oo-cli-large-external-pr-guard -->");
        expect(comment).toContain("This pull request changes 200 lines (120 additions and 80 deletions)");
        expect(comment).toContain("Please open an issue instead");
    });

    test("allows organization members before applying the diff limit", async () => {
        const requests = installGitHubApiFetchStub({
            organizationMember: true,
        });

        await withTempPullRequestEvent({
            additions: 500,
            authorLogin: "l1shen",
            deletions: 500,
        }, async (eventPath) => {
            await main({
                GITHUB_API_URL: "https://api.example.test/",
                GITHUB_EVENT_PATH: eventPath,
                GITHUB_TOKEN: "token",
            });
        });

        expect(requests).toEqual([{
            init: expect.objectContaining({
                method: "GET",
            }),
            url: "https://api.example.test/orgs/oomol-lab/members/l1shen",
        }]);
    });

    test("uses the organization membership token for membership checks", async () => {
        const requests = installGitHubApiFetchStub({
            organizationMember: true,
        });

        await withTempPullRequestEvent({
            additions: 500,
            authorLogin: "l1shen",
            deletions: 500,
        }, async (eventPath) => {
            await main({
                GITHUB_API_URL: "https://api.example.test/",
                GITHUB_EVENT_PATH: eventPath,
                GITHUB_TOKEN: "write-token",
                ORG_MEMBERSHIP_TOKEN: "membership-token",
            });
        });

        expect(getHeaderValue(requests[0]?.init, "authorization")).toBe("Bearer membership-token");
    });

    test("allows non organization members below the diff limit after membership check", async () => {
        const requests = installGitHubApiFetchStub({
            organizationMember: false,
        });

        await withTempPullRequestEvent({
            additions: 120,
            deletions: 79,
        }, async (eventPath) => {
            await main({
                GITHUB_API_URL: "https://api.example.test/",
                GITHUB_EVENT_PATH: eventPath,
                GITHUB_TOKEN: "token",
            });
        });

        expect(requests).toEqual([{
            init: expect.objectContaining({
                method: "GET",
            }),
            url: "https://api.example.test/orgs/oomol-lab/members/contributor",
        }]);
    });

    test("comments and closes large pull requests from non organization members", async () => {
        const requests = installGitHubApiFetchStub({
            organizationMember: false,
        });

        await withTempPullRequestEvent({
            additions: 120,
            deletions: 80,
        }, async (eventPath) => {
            await main({
                GITHUB_API_URL: "https://api.example.test/",
                GITHUB_EVENT_PATH: eventPath,
                GITHUB_TOKEN: "token",
            });
        });

        expect(requests).toHaveLength(4);
        expect(requests[0]).toMatchObject({
            url: "https://api.example.test/orgs/oomol-lab/members/contributor",
        });

        const commentListRequest = requests.find(request =>
            request.init?.method === "GET" && request.url.includes("/issues/157/comments"));
        const commentCreateRequest = requests.find(request => request.init?.method === "POST");
        const closeRequest = requests.find(request => request.init?.method === "PATCH");
        if (
            commentListRequest === undefined
            || commentCreateRequest === undefined
            || closeRequest === undefined
        ) {
            throw new Error("Expected comment list, comment create, and close requests.");
        }

        expect(commentListRequest).toMatchObject({
            url: "https://api.example.test/repos/oomol-lab/oo-cli/issues/157/comments?per_page=100",
        });
        expect(commentListRequest.init?.body).toBeUndefined();
        expect(JSON.parse(String(commentCreateRequest.init?.body))).toMatchObject({
            body: expect.stringContaining("oo-cli-large-external-pr-guard"),
        });
        expect(JSON.parse(String(closeRequest.init?.body))).toEqual({
            state: "closed",
        });
    });
});

interface PullRequestEventOptions {
    additions: number;
    authorLogin?: string;
    deletions: number;
}

interface CapturedFetchRequest {
    init: FetchInit;
    url: string;
}

interface GitHubApiFetchStubOptions {
    organizationMember: boolean;
}

function installGitHubApiFetchStub(options: GitHubApiFetchStubOptions): CapturedFetchRequest[] {
    const requests: CapturedFetchRequest[] = [];

    // Bun's fetch type requires a `preconnect` property; preserve the original.
    globalThis.fetch = Object.assign(async (
        input: Parameters<typeof fetch>[0],
        init?: FetchInit,
    ): Promise<Response> => {
        const url = String(input);
        requests.push({
            init,
            url,
        });

        if (url.includes("/orgs/oomol-lab/members/")) {
            return options.organizationMember
                ? new Response(null, { status: 204, statusText: "No Content" })
                : Response.json({ message: "Not Found" }, {
                        status: 404,
                        statusText: "Not Found",
                    });
        }

        if (init?.method === "GET") {
            return Response.json([]);
        }

        return Response.json({});
    }, {
        preconnect: originalFetch.preconnect,
    });

    return requests;
}

function getHeaderValue(init: FetchInit | undefined, name: string): string | undefined {
    const headers = init?.headers;
    if (headers === undefined) {
        return undefined;
    }

    return new Headers(headers).get(name) ?? undefined;
}

async function withTempPullRequestEvent(
    options: PullRequestEventOptions,
    run: (eventPath: string) => Promise<void>,
): Promise<void> {
    const directory = await mkdtemp(join(tmpdir(), "oo-large-pr-"));
    const eventPath = join(directory, "event.json");

    try {
        await writePullRequestEvent(eventPath, options);
        await run(eventPath);
    }
    finally {
        await rm(directory, { force: true, recursive: true });
    }
}

async function writePullRequestEvent(eventPath: string, options: PullRequestEventOptions): Promise<void> {
    await Bun.write(eventPath, JSON.stringify({
        repository: {
            name: "oo-cli",
            owner: {
                login: "oomol-lab",
            },
        },
        pull_request: {
            additions: options.additions,
            author_association: "NONE",
            deletions: options.deletions,
            number: 157,
            user: {
                login: options.authorLogin ?? "contributor",
                type: "User",
            },
        },
    }));
}
