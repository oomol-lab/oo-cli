import type { CliExecutionContext, Fetcher } from "../contracts/cli.ts";

import type { TerminalColors } from "../terminal-colors.ts";
import { APP_NAME } from "../config/app-config.ts";
import { createWriterColors } from "../terminal-colors.ts";

const defaultRegistryUrl = "https://registry.npmjs.org/";
const latestReleaseCacheTtlMs = 1000 * 60 * 60 * 24;
const updateNoticeCacheTtlMs = 1000 * 60 * 60 * 24;
const updateFailureCacheTtlMs = 1000 * 60 * 60;
const updateRequestTimeoutMs = 800;

interface LatestReleaseCacheValue {
    latestVersion: string;
}

interface UpdateNotifierOptions {
    argv: readonly string[];
    context: CliExecutionContext;
}

interface UpdateCheckDecision {
    allowed: boolean;
    reason:
        | "ci"
        | "disabled-in-settings"
        | "enabled"
        | "help-or-version"
        | "invalid-current-version"
        | "not-tty"
        | "opted-out";
}

interface ParsedReleaseVersion {
    core: readonly [number, number, number];
    prerelease: readonly (number | string)[];
}

export async function maybeNotifyAboutCliUpdate(
    options: UpdateNotifierOptions,
): Promise<void> {
    try {
        const decision = await resolveUpdateCheckDecision(options);

        if (!decision.allowed) {
            options.context.logger.debug(
                {
                    reason: decision.reason,
                },
                "CLI update check skipped.",
            );
            return;
        }

        options.context.logger.debug(
            {
                currentVersion: options.context.version,
                packageName: options.context.packageName,
            },
            "CLI update check started.",
        );
        const latestVersion = await resolveLatestReleaseVersion(options.context);

        if (latestVersion === null) {
            options.context.logger.debug(
                {
                    currentVersion: options.context.version,
                },
                "CLI update check did not resolve a latest version.",
            );
            return;
        }

        if (compareReleaseVersions(latestVersion, options.context.version) <= 0) {
            options.context.logger.debug(
                {
                    currentVersion: options.context.version,
                    latestVersion,
                },
                "CLI update check found no newer version.",
            );
            return;
        }

        const updateNoticeCache = options.context.cacheStore.getCache<true>({
            id: "cli-update-notice",
            defaultTtlMs: updateNoticeCacheTtlMs,
            maxEntries: 8,
        });
        const updateNoticeKey = [
            options.context.version,
            latestVersion,
        ].join(":");

        if (updateNoticeCache.has(updateNoticeKey)) {
            options.context.logger.debug(
                {
                    currentVersion: options.context.version,
                    latestVersion,
                },
                "CLI update notice was already shown for this version pair.",
            );
            return;
        }

        updateNoticeCache.set(updateNoticeKey, true);
        options.context.stderr.write(
            renderUpdateNotice({
                context: options.context,
                latestVersion,
                updateCommand: resolvePackageManagerUpgradeCommand(
                    options.context.env,
                    options.context.packageName,
                ),
            }),
        );
        options.context.logger.info(
            {
                currentVersion: options.context.version,
                latestVersion,
            },
            "CLI update notice emitted.",
        );
    }
    catch (error) {
        options.context.logger.debug(
            {
                err: error,
            },
            "Failed to check for CLI updates.",
        );
    }
}

function renderUpdateNotice(options: {
    context: CliExecutionContext;
    latestVersion: string;
    updateCommand: string;
}): string {
    const colors = createWriterColors(options.context.stderr);
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

async function resolveUpdateCheckDecision(
    options: UpdateNotifierOptions,
): Promise<UpdateCheckDecision> {
    if (!options.context.stderr.isTTY) {
        return {
            allowed: false,
            reason: "not-tty",
        };
    }

    if (hasHelpOrVersionArgument(options.argv)) {
        return {
            allowed: false,
            reason: "help-or-version",
        };
    }

    if (
        hasOptOutEnvironmentVariable(options.context.env)
        || options.context.env.NODE_ENV === "test"
    ) {
        return {
            allowed: false,
            reason: "opted-out",
        };
    }

    if (isCiEnvironment(options.context.env)) {
        return {
            allowed: false,
            reason: "ci",
        };
    }

    if (parseReleaseVersion(options.context.version) === null) {
        return {
            allowed: false,
            reason: "invalid-current-version",
        };
    }

    const settings = await options.context.settingsStore.read();

    if (settings.updateNotifier === false) {
        return {
            allowed: false,
            reason: "disabled-in-settings",
        };
    }

    return {
        allowed: true,
        reason: "enabled",
    };
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

    const updateFailureCache = context.cacheStore.getCache<true>({
        id: "cli-update-failure-backoff",
        defaultTtlMs: updateFailureCacheTtlMs,
        maxEntries: 1,
    });

    if (updateFailureCache.has("cooldown")) {
        context.logger.debug(
            {},
            "CLI update check is in failure-backoff cooldown.",
        );
        return null;
    }

    const latestVersion = await fetchLatestReleaseVersion({
        currentVersion: context.version,
        env: context.env,
        fetcher: context.fetcher,
        logger: context.logger,
        packageName: context.packageName,
    });

    if (latestVersion === null) {
        updateFailureCache.set("cooldown", true);
        context.logger.warn(
            {},
            "CLI update check entered failure-backoff cooldown after a fetch failure.",
        );
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
    const requestUrl = resolveRegistryPackageMetadataUrl(
        options.env,
        options.packageName,
    );
    const requestStartedAt = Date.now();

    options.logger.debug(
        {
            packageName: options.packageName,
            requestUrl,
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
                durationMs: Date.now() - requestStartedAt,
                packageName: options.packageName,
                requestUrl,
            },
            "CLI update latest-release request timed out or failed.",
        );
        return null;
    }

    if (!response.ok) {
        options.logger.warn(
            {
                durationMs: Date.now() - requestStartedAt,
                packageName: options.packageName,
                requestUrl,
                status: response.status,
            },
            "CLI update latest-release request returned a non-success status.",
        );
        return null;
    }

    let payload: unknown;

    try {
        payload = await response.json();
    }
    catch {
        return null;
    }

    if (!payload || typeof payload !== "object") {
        return null;
    }

    const distTags = "dist-tags" in payload ? payload["dist-tags"] : undefined;

    if (!distTags || typeof distTags !== "object") {
        return null;
    }

    const latestVersion = "latest" in distTags ? distTags.latest : undefined;

    if (typeof latestVersion !== "string" || latestVersion === "") {
        return null;
    }

    options.logger.debug(
        {
            durationMs: Date.now() - requestStartedAt,
            latestVersion,
            packageName: options.packageName,
            requestUrl,
            status: response.status,
        },
        "CLI update latest-release request completed.",
    );

    return latestVersion;
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

function hasHelpOrVersionArgument(argv: readonly string[]): boolean {
    for (const argument of argv) {
        if (
            argument === "help"
            || argument === "--help"
            || argument === "-h"
            || argument === "--version"
            || argument === "-V"
        ) {
            return true;
        }
    }

    return false;
}

function hasOptOutEnvironmentVariable(
    env: Record<string, string | undefined>,
): boolean {
    return env.OO_NO_UPDATE_NOTIFIER !== undefined
        || env.NO_UPDATE_NOTIFIER !== undefined;
}

function isCiEnvironment(
    env: Record<string, string | undefined>,
): boolean {
    return isTruthyEnvironmentValue(env.CI)
        || isTruthyEnvironmentValue(env.CONTINUOUS_INTEGRATION)
        || isTruthyEnvironmentValue(env.BUILD_NUMBER)
        || isTruthyEnvironmentValue(env.RUN_ID)
        || isTruthyEnvironmentValue(env.GITHUB_ACTIONS);
}

function isTruthyEnvironmentValue(value: string | undefined): boolean {
    if (value === undefined) {
        return false;
    }

    const normalizedValue = value.trim().toLowerCase();

    return normalizedValue !== "" && normalizedValue !== "0" && normalizedValue !== "false";
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
