import process from "node:process";

const DEFAULT_GITHUB_API_URL = "https://api.github.com";
const DEFAULT_EXTERNAL_PR_DIFF_LIMIT = 200;
const INTERNAL_ORGANIZATION_LOGIN = "oomol-lab";
const REJECTION_COMMENT_MARKER = "<!-- oo-cli-large-external-pr-guard -->";

interface PullRequestGuardInput {
    additions: number;
    authorIsOrganizationMember: boolean;
    deletions: number;
    diffLimit?: number;
}

interface PullRequestGuardDecision {
    diffSize: number;
    diffLimit: number;
    shouldReject: boolean;
}

interface RejectionCommentInput {
    additions: number;
    deletions: number;
    diffLimit: number;
}

interface PullRequestRef {
    owner: string;
    pullNumber: number;
    repo: string;
}

interface PullRequestEvent extends PullRequestRef {
    pullRequest: PullRequestEventInput;
}

interface PullRequestEventInput {
    additions: number;
    authorLogin: string;
    deletions: number;
}

interface GitHubApiClientOptions {
    apiUrl: string;
    token: string;
}

type GitHubRequestOptions = GitHubApiClientOptions & {
    body?: unknown;
    method: string;
    path: string;
};

interface GitHubIssueComment {
    body?: string;
}

export function evaluateLargeExternalPullRequest(input: PullRequestGuardInput): PullRequestGuardDecision {
    const diffLimit = input.diffLimit ?? DEFAULT_EXTERNAL_PR_DIFF_LIMIT;
    const diffSize = Math.abs(input.additions) + Math.abs(input.deletions);

    return {
        diffSize,
        diffLimit,
        shouldReject: !input.authorIsOrganizationMember && diffSize >= diffLimit,
    };
}

export function buildLargeExternalPullRequestRejectionComment(input: RejectionCommentInput): string {
    const additions = Math.abs(input.additions);
    const deletions = Math.abs(input.deletions);
    const diffSize = additions + deletions;
    return [
        REJECTION_COMMENT_MARKER,
        "Thanks for your contribution. This repository is primarily maintained internally, and we are not able to reliably review large pull requests from contributors outside the oomol-lab organization.",
        "",
        `This pull request changes ${diffSize} lines (${additions} additions and ${deletions} deletions), which is at or above our non-organization pull request limit of ${input.diffLimit}. We are closing it automatically.`,
        "",
        "Please open an issue instead with the problem, expected behavior, and any relevant context. That gives the maintainers a better path to evaluate and plan the change.",
    ].join("\n");
}

function readRequiredEnv(environment: NodeJS.ProcessEnv, name: string): string {
    const value = environment[name];
    if (value === undefined || value === "") {
        throw new Error(`${name} is required.`);
    }

    return value;
}

function readOptionalEnv(environment: NodeJS.ProcessEnv, name: string): string | undefined {
    const value = environment[name];
    return value === undefined || value === "" ? undefined : value;
}

async function readPullRequestEvent(eventPath: string): Promise<PullRequestEvent> {
    const eventPayload = parseObject(JSON.parse(await Bun.file(eventPath).text()), "GitHub event payload");
    const repository = parseObject(eventPayload.repository, "repository");
    const repositoryOwner = parseObject(repository.owner, "repository.owner");
    const pullRequest = parseObject(eventPayload.pull_request, "pull_request");
    const pullRequestAuthor = parseObject(pullRequest.user, "pull_request.user");

    return {
        owner: parseString(repositoryOwner.login, "repository.owner.login"),
        repo: parseString(repository.name, "repository.name"),
        pullNumber: parseNumber(pullRequest.number, "pull_request.number"),
        pullRequest: {
            additions: parseNumber(pullRequest.additions, "pull_request.additions"),
            deletions: parseNumber(pullRequest.deletions, "pull_request.deletions"),
            authorLogin: parseString(pullRequestAuthor.login, "pull_request.user.login"),
        },
    };
}

function parseObject(value: unknown, fieldName: string): Record<string, unknown> {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }

    throw new TypeError(`${fieldName} must be an object.`);
}

function parseString(value: unknown, fieldName: string): string {
    if (typeof value === "string" && value !== "") {
        return value;
    }

    throw new TypeError(`${fieldName} must be a non-empty string.`);
}

function parseNumber(value: unknown, fieldName: string): number {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    throw new TypeError(`${fieldName} must be a finite number.`);
}

function buildRepoPath(ref: PullRequestRef, suffix: string): string {
    return `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/${suffix}`;
}

function buildOrgPath(organization: string, suffix: string): string {
    return `/orgs/${encodeURIComponent(organization)}/${suffix}`;
}

async function ensureRejectionComment(
    options: GitHubApiClientOptions & PullRequestRef & { commentBody: string },
): Promise<void> {
    const { commentBody, ...requestOptions } = options;
    const existingComments = await requestGitHubJson<GitHubIssueComment[]>({
        ...requestOptions,
        method: "GET",
        path: buildRepoPath(requestOptions, `issues/${requestOptions.pullNumber}/comments?per_page=100`),
    });

    if (existingComments.some(comment => comment.body?.includes(REJECTION_COMMENT_MARKER) === true)) {
        return;
    }

    await requestGitHubJson({
        ...requestOptions,
        method: "POST",
        path: buildRepoPath(requestOptions, `issues/${requestOptions.pullNumber}/comments`),
        body: {
            body: commentBody,
        },
    });
}

async function closePullRequest(
    options: GitHubApiClientOptions & PullRequestRef,
): Promise<void> {
    await requestGitHubJson({
        ...options,
        method: "PATCH",
        path: buildRepoPath(options, `pulls/${options.pullNumber}`),
        body: {
            state: "closed",
        },
    });
}

async function githubFetch(
    options: GitHubApiClientOptions & { body?: unknown; method: string; path: string },
): Promise<{ response: Response; responseText: string }> {
    const response = await fetch(`${trimTrailingSlash(options.apiUrl)}${options.path}`, {
        method: options.method,
        headers: {
            "accept": "application/vnd.github+json",
            "authorization": `Bearer ${options.token}`,
            "content-type": "application/json",
            "x-github-api-version": "2022-11-28",
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(15_000),
    });
    return { response, responseText: await response.text() };
}

async function requestGitHubJson<Value>(options: GitHubRequestOptions): Promise<Value> {
    const { response, responseText } = await githubFetch(options);

    if (!response.ok) {
        throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}\n${responseText}`);
    }

    if (responseText === "") {
        return undefined as Value;
    }

    return JSON.parse(responseText) as Value;
}

async function authorIsOrganizationMember(
    options: GitHubApiClientOptions & { organization: string; username: string },
): Promise<boolean> {
    const { response, responseText } = await githubFetch({
        apiUrl: options.apiUrl,
        method: "GET",
        path: buildOrgPath(options.organization, `members/${encodeURIComponent(options.username)}`),
        token: options.token,
    });

    if (response.ok) {
        return true;
    }
    if (response.status === 404) {
        return false;
    }

    throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}\n${responseText}`);
}

function trimTrailingSlash(value: string): string {
    return value.endsWith("/") ? value.slice(0, -1) : value;
}

export async function main(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
    const event = await readPullRequestEvent(readRequiredEnv(environment, "GITHUB_EVENT_PATH"));
    const apiUrl = environment.GITHUB_API_URL ?? DEFAULT_GITHUB_API_URL;
    const membershipToken = readOptionalEnv(environment, "ORG_MEMBERSHIP_TOKEN")
        ?? readRequiredEnv(environment, "GITHUB_TOKEN");
    const isOrganizationMember = await authorIsOrganizationMember({
        apiUrl,
        organization: INTERNAL_ORGANIZATION_LOGIN,
        token: membershipToken,
        username: event.pullRequest.authorLogin,
    });
    const decision = evaluateLargeExternalPullRequest({
        additions: event.pullRequest.additions,
        authorIsOrganizationMember: isOrganizationMember,
        deletions: event.pullRequest.deletions,
    });
    const decisionSummary = `orgMember=${isOrganizationMember}, diff=${decision.diffSize}, limit=${decision.diffLimit}`;

    if (!decision.shouldReject) {
        process.stdout.write(`Pull request allowed: ${decisionSummary}.\n`);
        return;
    }

    const apiClientOptions = {
        apiUrl,
        token: readRequiredEnv(environment, "GITHUB_TOKEN"),
    };
    const commentBody = buildLargeExternalPullRequestRejectionComment({
        additions: event.pullRequest.additions,
        deletions: event.pullRequest.deletions,
        diffLimit: decision.diffLimit,
    });

    await Promise.all([
        ensureRejectionComment({
            ...apiClientOptions,
            commentBody,
            owner: event.owner,
            pullNumber: event.pullNumber,
            repo: event.repo,
        }),
        closePullRequest({
            ...apiClientOptions,
            owner: event.owner,
            pullNumber: event.pullNumber,
            repo: event.repo,
        }),
    ]);
    process.stdout.write(`Closed non-organization pull request #${event.pullNumber}: ${decisionSummary}.\n`);
}

if (import.meta.main) {
    await main();
}
