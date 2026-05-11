import process from "node:process";

const DEFAULT_GITHUB_API_URL = "https://api.github.com";
const DEFAULT_EXTERNAL_PR_DIFF_LIMIT = 200;
const REJECTION_COMMENT_MARKER = "<!-- oo-cli-large-external-pr-guard -->";
const INTERNAL_AUTHOR_ASSOCIATIONS = new Set(["COLLABORATOR", "MEMBER", "OWNER"]);
const INTERNAL_REPOSITORY_PERMISSIONS = new Set(["admin", "maintain", "write"]);

interface PullRequestGuardInput {
    additions: number;
    authorAssociation: string;
    authorLogin?: string;
    authorType?: string;
    baseRepositoryFullName?: string;
    deletions: number;
    diffLimit?: number;
    headRepositoryFullName?: string;
}

interface PullRequestGuardDecision {
    authorIsBot: boolean;
    authorIsExternal: boolean;
    diffSize: number;
    diffLimit: number;
    shouldReject: boolean;
    sourceIsExternal: boolean;
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
    pullRequest: PullRequestGuardInput;
}

interface GitHubApiClientOptions {
    apiUrl: string;
    token: string;
}

type GitHubRequestOptions = GitHubApiClientOptions & {
    body?: unknown;
    method: string;
    notFoundValue?: unknown;
    path: string;
};

interface GitHubIssueComment {
    body?: string;
}

interface GitHubCollaboratorPermission {
    permission?: string;
    user?: {
        permissions?: {
            admin?: boolean;
            maintain?: boolean;
            push?: boolean;
        };
    };
}

export function evaluateLargeExternalPullRequest(input: PullRequestGuardInput): PullRequestGuardDecision {
    const diffLimit = input.diffLimit ?? DEFAULT_EXTERNAL_PR_DIFF_LIMIT;
    const diffSize = Math.abs(input.additions) + Math.abs(input.deletions);
    const authorIsBot = input.authorType === "Bot";
    const sourceIsExternal = evaluateSourceIsExternal(input);
    const authorIsExternal = !authorIsBot
        && sourceIsExternal
        && !INTERNAL_AUTHOR_ASSOCIATIONS.has(input.authorAssociation);

    return {
        authorIsBot,
        authorIsExternal,
        diffSize,
        diffLimit,
        shouldReject: authorIsExternal && diffSize >= diffLimit,
        sourceIsExternal,
    };
}

export function buildLargeExternalPullRequestRejectionComment(input: RejectionCommentInput): string {
    const additions = Math.abs(input.additions);
    const deletions = Math.abs(input.deletions);
    const diffSize = additions + deletions;
    return [
        REJECTION_COMMENT_MARKER,
        "Thanks for your contribution. This repository is primarily maintained internally, and we are not able to reliably review large pull requests from external contributors.",
        "",
        `This pull request changes ${diffSize} lines (${additions} additions and ${deletions} deletions), which is at or above our external pull request limit of ${input.diffLimit}. We are closing it automatically.`,
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

async function readPullRequestEvent(eventPath: string): Promise<PullRequestEvent> {
    const eventPayload = parseObject(JSON.parse(await Bun.file(eventPath).text()), "GitHub event payload");
    const repository = parseObject(eventPayload.repository, "repository");
    const repositoryOwner = parseObject(repository.owner, "repository.owner");
    const pullRequest = parseObject(eventPayload.pull_request, "pull_request");
    const pullRequestAuthor = parseObject(pullRequest.user, "pull_request.user");
    const baseRepositoryFullName = parsePullRequestRepositoryFullName(pullRequest, "base");
    const headRepositoryFullName = parsePullRequestRepositoryFullName(pullRequest, "head");

    return {
        owner: parseString(repositoryOwner.login, "repository.owner.login"),
        repo: parseString(repository.name, "repository.name"),
        pullNumber: parseNumber(pullRequest.number, "pull_request.number"),
        pullRequest: {
            additions: parseNumber(pullRequest.additions, "pull_request.additions"),
            deletions: parseNumber(pullRequest.deletions, "pull_request.deletions"),
            authorAssociation: parseString(pullRequest.author_association, "pull_request.author_association"),
            authorLogin: parseString(pullRequestAuthor.login, "pull_request.user.login"),
            authorType: parseString(pullRequestAuthor.type, "pull_request.user.type"),
            baseRepositoryFullName,
            headRepositoryFullName,
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

function parsePullRequestRepositoryFullName(
    pullRequest: Record<string, unknown>,
    refName: "base" | "head",
): string | undefined {
    const pullRequestRef = parseOptionalObject(pullRequest[refName]);
    if (pullRequestRef === undefined) {
        return undefined;
    }

    const repository = parseOptionalObject(pullRequestRef.repo);
    if (repository === undefined) {
        return undefined;
    }

    const fullName = repository.full_name;
    if (typeof fullName !== "string") {
        return undefined;
    }

    const normalizedFullName = fullName.trim();
    return normalizedFullName === "" ? undefined : normalizedFullName;
}

function parseOptionalObject(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
}

function evaluateSourceIsExternal(input: PullRequestGuardInput): boolean {
    const baseRepositoryFullName = input.baseRepositoryFullName?.trim();
    const headRepositoryFullName = input.headRepositoryFullName?.trim();

    if (baseRepositoryFullName === undefined || baseRepositoryFullName === "") {
        return true;
    }
    if (headRepositoryFullName === undefined || headRepositoryFullName === "") {
        return true;
    }

    return baseRepositoryFullName !== headRepositoryFullName;
}

function buildRepoPath(ref: PullRequestRef, suffix: string): string {
    return `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/${suffix}`;
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

async function authorHasRepositoryWritePermission(
    options: GitHubApiClientOptions & PullRequestRef & { username: string },
): Promise<boolean> {
    const permission = await requestGitHubJson<GitHubCollaboratorPermission | undefined>({
        ...options,
        method: "GET",
        notFoundValue: undefined,
        path: buildRepoPath(options, `collaborators/${encodeURIComponent(options.username)}/permission`),
    });

    return permission !== undefined && hasRepositoryWritePermission(permission);
}

function hasRepositoryWritePermission(permission: GitHubCollaboratorPermission): boolean {
    if (permission.permission !== undefined && INTERNAL_REPOSITORY_PERMISSIONS.has(permission.permission)) {
        return true;
    }

    return permission.user?.permissions?.admin === true
        || permission.user?.permissions?.maintain === true
        || permission.user?.permissions?.push === true;
}

async function requestGitHubJson<Value>(options: GitHubRequestOptions): Promise<Value> {
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
    const responseText = await response.text();

    if (response.status === 404 && "notFoundValue" in options) {
        return options.notFoundValue as Value;
    }

    if (!response.ok) {
        throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}\n${responseText}`);
    }

    if (responseText === "") {
        return undefined as Value;
    }

    return JSON.parse(responseText) as Value;
}

function trimTrailingSlash(value: string): string {
    return value.endsWith("/") ? value.slice(0, -1) : value;
}

export async function main(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
    const event = await readPullRequestEvent(readRequiredEnv(environment, "GITHUB_EVENT_PATH"));
    const decision = evaluateLargeExternalPullRequest(event.pullRequest);
    const decisionSummary = `association=${event.pullRequest.authorAssociation}, bot=${decision.authorIsBot}, sourceExternal=${decision.sourceIsExternal}, authorExternal=${decision.authorIsExternal}, diff=${decision.diffSize}, limit=${decision.diffLimit}`;

    if (!decision.shouldReject) {
        process.stdout.write(`Pull request allowed: ${decisionSummary}.\n`);
        return;
    }

    const apiClientOptions = {
        apiUrl: environment.GITHUB_API_URL ?? DEFAULT_GITHUB_API_URL,
        token: readRequiredEnv(environment, "GITHUB_TOKEN"),
    };
    if (
        event.pullRequest.authorLogin !== undefined
        && await authorHasRepositoryWritePermission({
            ...apiClientOptions,
            owner: event.owner,
            pullNumber: event.pullNumber,
            repo: event.repo,
            username: event.pullRequest.authorLogin,
        })
    ) {
        process.stdout.write(`Pull request allowed: ${decisionSummary}.\n`);
        return;
    }

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
    process.stdout.write(`Closed external pull request #${event.pullNumber}: ${decisionSummary}.\n`);
}

if (import.meta.main) {
    await main();
}
