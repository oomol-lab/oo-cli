import { describe, expect, test } from "bun:test";

import {
    buildLargeExternalPullRequestRejectionComment,
    evaluateLargeExternalPullRequest,
} from "./reject-large-external-pr.ts";

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
});
