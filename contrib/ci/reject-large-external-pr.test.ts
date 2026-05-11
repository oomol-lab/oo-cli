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
    test("rejects external pull requests at the diff limit", () => {
        expect(evaluateLargeExternalPullRequest({
            additions: 120,
            deletions: 80,
            authorAssociation: "CONTRIBUTOR",
        })).toEqual({
            authorIsBot: false,
            authorIsExternal: true,
            diffLimit: 200,
            diffSize: 200,
            shouldReject: true,
            sourceIsExternal: true,
        });
    });

    test("allows external pull requests below the diff limit", () => {
        expect(evaluateLargeExternalPullRequest({
            additions: 120,
            deletions: 79,
            authorAssociation: "FIRST_TIME_CONTRIBUTOR",
        }).shouldReject).toBeFalse();
    });

    test("allows organization members above the diff limit", () => {
        expect(evaluateLargeExternalPullRequest({
            additions: 500,
            deletions: 500,
            authorAssociation: "MEMBER",
        })).toMatchObject({
            authorIsBot: false,
            authorIsExternal: false,
            diffSize: 1000,
            shouldReject: false,
        });
    });

    test("allows organization owners above the diff limit", () => {
        expect(evaluateLargeExternalPullRequest({
            additions: 500,
            deletions: 500,
            authorAssociation: "OWNER",
        }).shouldReject).toBeFalse();
    });

    test("allows repository collaborators above the diff limit", () => {
        expect(evaluateLargeExternalPullRequest({
            additions: 500,
            deletions: 500,
            authorAssociation: "COLLABORATOR",
        })).toMatchObject({
            authorIsBot: false,
            authorIsExternal: false,
            diffSize: 1000,
            shouldReject: false,
        });
    });

    test("allows same-repository pull requests above the diff limit", () => {
        expect(evaluateLargeExternalPullRequest({
            additions: 500,
            authorAssociation: "NONE",
            baseRepositoryFullName: "oomol-lab/oo-cli",
            deletions: 500,
            headRepositoryFullName: "oomol-lab/oo-cli",
        })).toMatchObject({
            authorIsExternal: false,
            shouldReject: false,
            sourceIsExternal: false,
        });
    });

    test("allows bots above the diff limit", () => {
        expect(evaluateLargeExternalPullRequest({
            additions: 500,
            deletions: 500,
            authorAssociation: "CONTRIBUTOR",
            authorType: "Bot",
        })).toMatchObject({
            authorIsBot: true,
            authorIsExternal: false,
            diffSize: 1000,
            shouldReject: false,
        });
    });

    test("uses absolute additions and deletions for diff size", () => {
        expect(evaluateLargeExternalPullRequest({
            additions: -120,
            deletions: -80,
            authorAssociation: "NONE",
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

    test("allows same-repository pull requests before requiring a GitHub token", async () => {
        await withTempPullRequestEvent({
            additions: 500,
            authorAssociation: "NONE",
            baseRepositoryFullName: "oomol-lab/oo-cli",
            deletions: 500,
            headRepositoryFullName: "oomol-lab/oo-cli",
        }, async (eventPath) => {
            await main({
                GITHUB_EVENT_PATH: eventPath,
            });
        });
    });

    test("allows users with repository write permission when author association is stale", async () => {
        const requests = installGitHubApiFetchStub({
            permissionResponse: {
                permission: "admin",
                user: {
                    permissions: {
                        admin: true,
                        maintain: true,
                        push: true,
                    },
                },
            },
        });

        await withTempPullRequestEvent({
            additions: 500,
            authorAssociation: "NONE",
            authorLogin: "l1shen",
            baseRepositoryFullName: "oomol-lab/oo-cli",
            deletions: 500,
            headRepositoryFullName: "l1shen/oo-cli",
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
            url: "https://api.example.test/repos/oomol-lab/oo-cli/collaborators/l1shen/permission",
        }]);
    });

    test("treats missing repository names as external when reading events", async () => {
        const requests = installGitHubApiFetchStub();

        await withTempPullRequestEvent({
            additions: 120,
            authorAssociation: "CONTRIBUTOR",
            baseRepositoryFullName: "oomol-lab/oo-cli",
            deletions: 80,
        }, async (eventPath) => {
            await main({
                GITHUB_API_URL: "https://api.example.test/",
                GITHUB_EVENT_PATH: eventPath,
                GITHUB_TOKEN: "token",
            });
        });

        expect(requests).toHaveLength(4);
        expect(requests.some(request => request.init?.method === "PATCH")).toBeTrue();
    });

    test("comments and closes large external pull requests without a GET body", async () => {
        const requests = installGitHubApiFetchStub();

        await withTempPullRequestEvent({
            additions: 120,
            authorAssociation: "CONTRIBUTOR",
            baseRepositoryFullName: "oomol-lab/oo-cli",
            deletions: 80,
            headRepositoryFullName: "external-user/oo-cli",
        }, async (eventPath) => {
            await main({
                GITHUB_API_URL: "https://api.example.test/",
                GITHUB_EVENT_PATH: eventPath,
                GITHUB_TOKEN: "token",
            });
        });

        expect(requests).toHaveLength(4);
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
    authorAssociation: string;
    authorLogin?: string;
    baseRepositoryFullName?: string;
    deletions: number;
    headRepositoryFullName?: string;
}

interface CapturedFetchRequest {
    init: FetchInit;
    url: string;
}

interface GitHubApiFetchStubOptions {
    permissionResponse?: unknown;
}

function installGitHubApiFetchStub(options: GitHubApiFetchStubOptions = {}): CapturedFetchRequest[] {
    const requests: CapturedFetchRequest[] = [];

    // Bun's fetch type requires a `preconnect` property; preserve the original.
    globalThis.fetch = Object.assign(async (
        input: Parameters<typeof fetch>[0],
        init?: FetchInit,
    ): Promise<Response> => {
        requests.push({
            init,
            url: String(input),
        });

        if (String(input).includes("/collaborators/")) {
            if (options.permissionResponse !== undefined) {
                return Response.json(options.permissionResponse);
            }

            return Response.json({ message: "Not Found" }, {
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
            author_association: options.authorAssociation,
            base: {
                repo: createPullRequestRepositoryPayload(options.baseRepositoryFullName),
            },
            deletions: options.deletions,
            head: {
                repo: createPullRequestRepositoryPayload(options.headRepositoryFullName),
            },
            number: 157,
            user: {
                login: options.authorLogin ?? "contributor",
                type: "User",
            },
        },
    }));
}

function createPullRequestRepositoryPayload(
    repositoryFullName: string | undefined,
): Record<string, string> {
    return repositoryFullName === undefined
        ? {}
        : {
                full_name: repositoryFullName,
            };
}
