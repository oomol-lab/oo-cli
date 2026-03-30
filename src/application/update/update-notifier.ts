import type { CliExecutionContext, Fetcher, Writer } from "../contracts/cli.ts";

import type { TerminalColors } from "../terminal-colors.ts";
import { APP_NAME } from "../config/app-config.ts";
import { measureDisplayWidth } from "../display-width.ts";
import { compareSemver, isSemver as isValidSemver } from "../semver.ts";
import { createWriterColors } from "../terminal-colors.ts";

const defaultRegistryUrl = "https://registry.npmjs.org/";
const updateRequestTimeoutMs = 2000;
const updateRequestMaxAttempts = 2;

interface LatestReleaseRequestSuccess {
    latestVersion: string;
    status: "success";
}

interface LatestReleaseRequestRetryableFailure {
    status: "retryable-failure";
}

interface LatestReleaseRequestTerminalFailure {
    status: "terminal-failure";
}

type LatestReleaseRequestAttemptResult
    = LatestReleaseRequestSuccess
        | LatestReleaseRequestRetryableFailure
        | LatestReleaseRequestTerminalFailure;

export type CliUpdateCheckResult
    = | {
        status: "failed";
        reason:
            | "invalid-current-version"
            | "latest-version-unavailable"
            | "unexpected-error";
    }
    | {
        status: "up-to-date";
        latestVersion: string;
    }
    | {
        status: "update-available";
        latestVersion: string;
    };

export async function checkForCliUpdate(
    context: CliExecutionContext,
): Promise<CliUpdateCheckResult> {
    try {
        if (!isValidSemver(context.version)) {
            context.logger.debug(
                {
                    currentVersion: context.version,
                },
                "CLI update check skipped because the current version is invalid.",
            );
            return {
                reason: "invalid-current-version",
                status: "failed",
            };
        }

        context.logger.debug(
            {
                currentVersion: context.version,
                packageName: context.packageName,
            },
            "CLI update check started.",
        );
        const latestVersion = await resolveLatestReleaseVersion(context);

        if (latestVersion === null) {
            context.logger.debug(
                {
                    currentVersion: context.version,
                },
                "CLI update check did not resolve a latest version.",
            );
            return {
                reason: "latest-version-unavailable",
                status: "failed",
            };
        }

        if (compareReleaseVersions(latestVersion, context.version) <= 0) {
            context.logger.debug(
                {
                    currentVersion: context.version,
                    latestVersion,
                },
                "CLI update check found no newer version.",
            );
            return {
                latestVersion,
                status: "up-to-date",
            };
        }

        return {
            latestVersion,
            status: "update-available",
        };
    }
    catch (error) {
        context.logger.debug(
            {
                err: error,
            },
            "Failed to check for CLI updates.",
        );
        return {
            reason: "unexpected-error",
            status: "failed",
        };
    }
}

export function renderCliUpdateNotice(options: {
    context: CliExecutionContext;
    latestVersion: string;
    updateCommand: string;
    writer?: Writer;
}): string {
    const colors = createWriterColors(options.writer ?? options.context.stderr);
    const lines = [
        options.context.translator.t("update.available.message", {
            currentVersion: colors.dim(options.context.version),
            latestVersion: colors.green(colors.bold(options.latestVersion)),
        }),
        options.context.translator.t("update.available.command", {
            command: colors.cyan(options.updateCommand),
        }),
    ];

    return `\n${renderNoticeBox(lines, colors)}\n`;
}

function renderNoticeBox(
    lines: readonly string[],
    colors: TerminalColors,
): string {
    const horizontalPadding = 2;
    const contentWidth = lines.reduce((maxWidth, line) => {
        const lineWidth = measureDisplayWidth(colors.strip(line));

        return lineWidth > maxWidth ? lineWidth : maxWidth;
    }, 0);
    const topBorder = colors.yellow(
        `╭${"─".repeat(contentWidth + horizontalPadding * 2)}╮`,
    );
    const bottomBorder = colors.yellow(
        `╰${"─".repeat(contentWidth + horizontalPadding * 2)}╯`,
    );
    const bodyLines = [
        renderNoticeBodyLine("", contentWidth, colors, horizontalPadding),
        ...lines.map(line =>
            renderNoticeBodyLine(line, contentWidth, colors, horizontalPadding),
        ),
        renderNoticeBodyLine("", contentWidth, colors, horizontalPadding),
    ];

    return [
        topBorder,
        ...bodyLines,
        bottomBorder,
    ].join("\n");
}

function renderNoticeBodyLine(
    line: string,
    width: number,
    colors: TerminalColors,
    horizontalPadding: number,
): string {
    const visibleLineWidth = measureDisplayWidth(colors.strip(line));
    const remainingWidth = width - visibleLineWidth;
    const leftSpacing = Math.floor(remainingWidth / 2);
    const rightSpacing = remainingWidth - leftSpacing;
    const sideBorder = colors.yellow("│");

    return [
        sideBorder,
        " ".repeat(horizontalPadding + leftSpacing),
        line,
        " ".repeat(horizontalPadding + rightSpacing),
        sideBorder,
    ].join("");
}

export function compareReleaseVersions(left: string, right: string): number {
    return compareSemver(left, right);
}

export function resolvePackageManagerUpgradeCommand(
    env: Record<string, string | undefined>,
    packageName: string,
): string {
    switch (resolvePreferredPackageManagerName(env)) {
        case "bun":
            return `bun install -g ${packageName}@latest`;
        case "pnpm":
            return `pnpm add -g ${packageName}@latest`;
        case "yarn":
            return `yarn global add ${packageName}@latest`;
        default:
            return `npm install -g ${packageName}@latest`;
    }
}

async function resolveLatestReleaseVersion(
    context: CliExecutionContext,
): Promise<string | null> {
    return await fetchLatestReleaseVersion({
        currentVersion: context.version,
        env: context.env,
        fetcher: context.fetcher,
        logger: context.logger,
        packageName: context.packageName,
    });
}

async function fetchLatestReleaseVersion(options: {
    currentVersion: string;
    env: Record<string, string | undefined>;
    fetcher: Fetcher;
    logger: CliExecutionContext["logger"];
    packageName: string;
}): Promise<string | null> {
    for (let attempt = 1; attempt <= updateRequestMaxAttempts; attempt += 1) {
        const result = await fetchLatestReleaseVersionAttempt({
            attempt,
            currentVersion: options.currentVersion,
            env: options.env,
            fetcher: options.fetcher,
            logger: options.logger,
            maxAttempts: updateRequestMaxAttempts,
            packageName: options.packageName,
        });

        switch (result.status) {
            case "success":
                return result.latestVersion;
            case "terminal-failure":
                return null;
            case "retryable-failure":
                if (attempt >= updateRequestMaxAttempts) {
                    return null;
                }

                options.logger.debug(
                    {
                        attempt,
                        maxAttempts: updateRequestMaxAttempts,
                        packageName: options.packageName,
                    },
                    "CLI update latest-release request retry scheduled.",
                );
                break;
        }
    }

    return null;
}

async function fetchLatestReleaseVersionAttempt(options: {
    attempt: number;
    currentVersion: string;
    env: Record<string, string | undefined>;
    fetcher: Fetcher;
    logger: CliExecutionContext["logger"];
    maxAttempts: number;
    packageName: string;
}): Promise<LatestReleaseRequestAttemptResult> {
    const requestUrl = resolveRegistryPackageMetadataUrl(
        options.env,
        options.packageName,
    );
    const requestStartedAt = Date.now();

    options.logger.debug(
        {
            attempt: options.attempt,
            maxAttempts: options.maxAttempts,
            packageName: options.packageName,
            requestUrl,
            timeoutMs: updateRequestTimeoutMs,
        },
        "CLI update latest-release request started.",
    );

    const response = await fetchWithTimeout(
        options.fetcher,
        requestUrl,
        {
            headers: {
                "accept": "application/json",
                "user-agent": `${APP_NAME}/${options.currentVersion}`,
            },
        },
        updateRequestTimeoutMs,
    );

    if (!response) {
        options.logger.warn(
            {
                attempt: options.attempt,
                durationMs: Date.now() - requestStartedAt,
                maxAttempts: options.maxAttempts,
                packageName: options.packageName,
                requestUrl,
                timeoutMs: updateRequestTimeoutMs,
            },
            "CLI update latest-release request timed out or failed.",
        );
        return {
            status: "retryable-failure",
        };
    }

    if (!response.ok) {
        options.logger.warn(
            {
                attempt: options.attempt,
                durationMs: Date.now() - requestStartedAt,
                maxAttempts: options.maxAttempts,
                packageName: options.packageName,
                requestUrl,
                status: response.status,
            },
            "CLI update latest-release request returned a non-success status.",
        );
        return {
            status: "terminal-failure",
        };
    }

    let payload: unknown;

    try {
        payload = await response.json();
    }
    catch {
        return {
            status: "terminal-failure",
        };
    }

    if (!payload || typeof payload !== "object") {
        return {
            status: "terminal-failure",
        };
    }

    const distTags = "dist-tags" in payload ? payload["dist-tags"] : undefined;

    if (!distTags || typeof distTags !== "object") {
        return {
            status: "terminal-failure",
        };
    }

    const latestVersion = "latest" in distTags ? distTags.latest : undefined;

    if (typeof latestVersion !== "string" || latestVersion === "") {
        return {
            status: "terminal-failure",
        };
    }

    options.logger.debug(
        {
            attempt: options.attempt,
            durationMs: Date.now() - requestStartedAt,
            latestVersion,
            maxAttempts: options.maxAttempts,
            packageName: options.packageName,
            requestUrl,
            status: response.status,
        },
        "CLI update latest-release request completed.",
    );

    return {
        latestVersion,
        status: "success",
    };
}

async function fetchWithTimeout(
    fetcher: Fetcher,
    input: string,
    init: RequestInit,
    timeoutMs: number,
): Promise<Response | null> {
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

    try {
        return await fetcher(input, {
            ...init,
            signal: abortController.signal,
        });
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeoutId);
    }
}

function resolveRegistryPackageMetadataUrl(
    env: Record<string, string | undefined>,
    packageName: string,
): string {
    const configuredRegistryUrl = env.npm_config_registry;

    try {
        const registryUrl = new URL(
            ensureTrailingSlash(configuredRegistryUrl ?? defaultRegistryUrl),
        );

        return new URL(encodeURIComponent(packageName), registryUrl).toString();
    }
    catch {
        return new URL(encodeURIComponent(packageName), defaultRegistryUrl).toString();
    }
}

function ensureTrailingSlash(value: string): string {
    return value.endsWith("/") ? value : `${value}/`;
}

function resolvePreferredPackageManagerName(
    env: Record<string, string | undefined>,
): string {
    return normalizePackageManagerName(env.OO_INSTALL_PACKAGE_MANAGER)
        ?? normalizePackageManagerName(readPackageManagerName(env.npm_config_user_agent))
        ?? "npm";
}

function readPackageManagerName(npmUserAgent: string | undefined): string | undefined {
    if (!npmUserAgent) {
        return undefined;
    }

    const [firstToken] = npmUserAgent.split(" ", 1);
    const resolvedFirstToken = firstToken ?? "npm";
    const slashIndex = resolvedFirstToken.indexOf("/");

    return slashIndex >= 0
        ? resolvedFirstToken.slice(0, slashIndex)
        : resolvedFirstToken;
}

function normalizePackageManagerName(value: string | undefined): string | undefined {
    switch (value?.trim().toLowerCase()) {
        case "npm":
        case "pnpm":
        case "bun":
        case "yarn":
            return value.trim().toLowerCase();
        default:
            return undefined;
    }
}
