import type { CliExecutionContext, Fetcher, Writer } from "../contracts/cli.ts";

import type { TerminalColors } from "../terminal-colors.ts";
import { APP_NAME } from "../config/app-config.ts";
import { createWriterColors } from "../terminal-colors.ts";

const defaultRegistryUrl = "https://registry.npmjs.org/";
const latestReleaseCacheTtlMs = 1000 * 60 * 60 * 24;
const updateRequestTimeoutMs = 2000;
const updateRequestMaxAttempts = 2;

interface LatestReleaseCacheValue {
    latestVersion: string;
}

interface LatestReleaseRequestFailure {
    retryable: boolean;
    status: "failed";
}

interface LatestReleaseRequestSuccess {
    latestVersion: string;
    status: "success";
}

interface ParsedReleaseVersion {
    core: readonly [number, number, number];
    prerelease: readonly (number | string)[];
}

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
        if (parseReleaseVersion(context.version) === null) {
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
            latestVersion: colors.green.bold(options.latestVersion),
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
    const parsedLeft = parseReleaseVersion(left);
    const parsedRight = parseReleaseVersion(right);

    if (parsedLeft === null || parsedRight === null) {
        return 0;
    }

    for (const [index, leftValue] of parsedLeft.core.entries()) {
        const rightValue = parsedRight.core[index]!;

        if (leftValue !== rightValue) {
            return leftValue > rightValue ? 1 : -1;
        }
    }

    return comparePrereleaseIdentifiers(
        parsedLeft.prerelease,
        parsedRight.prerelease,
    );
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
    const latestReleaseCache = context.cacheStore.getCache<LatestReleaseCacheValue>({
        id: "cli-update-latest-release",
        defaultTtlMs: latestReleaseCacheTtlMs,
        maxEntries: 1,
    });
    const cachedLatestRelease = latestReleaseCache.get("latest");

    if (cachedLatestRelease !== null) {
        context.logger.debug(
            {
                latestVersion: cachedLatestRelease.latestVersion,
            },
            "CLI update latest-release cache hit.",
        );
        return cachedLatestRelease.latestVersion;
    }

    const latestVersion = await fetchLatestReleaseVersion({
        currentVersion: context.version,
        env: context.env,
        fetcher: context.fetcher,
        logger: context.logger,
        packageName: context.packageName,
    });

    if (latestVersion === null) {
        return null;
    }

    latestReleaseCache.set("latest", { latestVersion });
    context.logger.debug(
        {
            latestVersion,
        },
        "CLI update latest-release cache stored.",
    );

    return latestVersion;
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

        if (result.status === "success") {
            return result.latestVersion;
        }

        if (!result.retryable || attempt >= updateRequestMaxAttempts) {
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
}): Promise<LatestReleaseRequestFailure | LatestReleaseRequestSuccess> {
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
            retryable: true,
            status: "failed",
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
            retryable: false,
            status: "failed",
        };
    }

    let payload: unknown;

    try {
        payload = await response.json();
    }
    catch {
        return {
            retryable: false,
            status: "failed",
        };
    }

    if (!payload || typeof payload !== "object") {
        return {
            retryable: false,
            status: "failed",
        };
    }

    const distTags = "dist-tags" in payload ? payload["dist-tags"] : undefined;

    if (!distTags || typeof distTags !== "object") {
        return {
            retryable: false,
            status: "failed",
        };
    }

    const latestVersion = "latest" in distTags ? distTags.latest : undefined;

    if (typeof latestVersion !== "string" || latestVersion === "") {
        return {
            retryable: false,
            status: "failed",
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

function parseReleaseVersion(value: string): ParsedReleaseVersion | null {
    if (value === "") {
        return null;
    }

    const buildSeparatorIndex = value.indexOf("+");
    const versionWithoutBuild = buildSeparatorIndex >= 0
        ? value.slice(0, buildSeparatorIndex)
        : value;
    const prereleaseSeparatorIndex = versionWithoutBuild.indexOf("-");
    const coreVersion = prereleaseSeparatorIndex >= 0
        ? versionWithoutBuild.slice(0, prereleaseSeparatorIndex)
        : versionWithoutBuild;
    const prereleaseVersion = prereleaseSeparatorIndex >= 0
        ? versionWithoutBuild.slice(prereleaseSeparatorIndex + 1)
        : "";
    const coreParts = coreVersion.split(".");

    if (coreParts.length !== 3) {
        return null;
    }

    const parsedCore = coreParts.map(parseNumericIdentifier);

    if (parsedCore.includes(null)) {
        return null;
    }

    const prereleaseParts = prereleaseVersion === ""
        ? []
        : prereleaseVersion.split(".");
    const parsedPrerelease = prereleaseParts.map(parsePrereleaseIdentifier);

    if (parsedPrerelease.includes(null)) {
        return null;
    }

    return {
        core: [
            parsedCore[0]!,
            parsedCore[1]!,
            parsedCore[2]!,
        ],
        prerelease: parsedPrerelease as readonly (number | string)[],
    };
}

function parseNumericIdentifier(value: string): number | null {
    if (value === "" || (value.length > 1 && value.startsWith("0"))) {
        return null;
    }

    for (const character of value) {
        if (!isAsciiDigit(character)) {
            return null;
        }
    }

    const parsedValue = Number.parseInt(value, 10);

    return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

function parsePrereleaseIdentifier(value: string): number | string | null {
    if (value === "") {
        return null;
    }

    let isNumeric = true;

    for (const character of value) {
        if (!isAllowedPrereleaseCharacter(character)) {
            return null;
        }

        if (!isAsciiDigit(character)) {
            isNumeric = false;
        }
    }

    if (!isNumeric) {
        return value;
    }

    if (value.length > 1 && value.startsWith("0")) {
        return null;
    }

    const parsedValue = Number.parseInt(value, 10);

    return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

function comparePrereleaseIdentifiers(
    left: readonly (number | string)[],
    right: readonly (number | string)[],
): number {
    if (left.length === 0 && right.length === 0) {
        return 0;
    }

    if (left.length === 0) {
        return 1;
    }

    if (right.length === 0) {
        return -1;
    }

    const partCount = Math.max(left.length, right.length);

    for (let index = 0; index < partCount; index += 1) {
        const leftPart = left[index];
        const rightPart = right[index];

        if (leftPart === undefined) {
            return -1;
        }

        if (rightPart === undefined) {
            return 1;
        }

        if (leftPart === rightPart) {
            continue;
        }

        if (typeof leftPart === "number" && typeof rightPart === "number") {
            return leftPart > rightPart ? 1 : -1;
        }

        if (typeof leftPart === "number") {
            return -1;
        }

        if (typeof rightPart === "number") {
            return 1;
        }

        return leftPart > rightPart ? 1 : -1;
    }

    return 0;
}

function isAsciiDigit(value: string): boolean {
    return value >= "0" && value <= "9";
}

function isAsciiLetter(value: string): boolean {
    return (value >= "a" && value <= "z")
        || (value >= "A" && value <= "Z");
}

function isAllowedPrereleaseCharacter(value: string): boolean {
    return isAsciiDigit(value) || isAsciiLetter(value) || value === "-";
}

function measureDisplayWidth(value: string): number {
    let width = 0;

    for (let index = 0; index < value.length; index += 1) {
        const codePoint = value.codePointAt(index);

        if (codePoint === undefined) {
            continue;
        }

        width += isWideCodePoint(codePoint) ? 2 : 1;

        if (codePoint > 0xFFFF) {
            index += 1;
        }
    }

    return width;
}

function isWideCodePoint(codePoint: number): boolean {
    return codePoint >= 0x1100 && (
        codePoint <= 0x115F
        || codePoint === 0x2329
        || codePoint === 0x232A
        || (codePoint >= 0x2E80 && codePoint <= 0xA4CF && codePoint !== 0x303F)
        || (codePoint >= 0xAC00 && codePoint <= 0xD7A3)
        || (codePoint >= 0xF900 && codePoint <= 0xFAFF)
        || (codePoint >= 0xFE10 && codePoint <= 0xFE19)
        || (codePoint >= 0xFE30 && codePoint <= 0xFE6F)
        || (codePoint >= 0xFF00 && codePoint <= 0xFF60)
        || (codePoint >= 0xFFE0 && codePoint <= 0xFFE6)
    );
}
