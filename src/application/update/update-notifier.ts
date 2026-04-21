import type { CliExecutionContext, Fetcher, Writer } from "../contracts/cli.ts";

import type { TerminalColors } from "../terminal-colors.ts";
import { z } from "zod";
import { APP_NAME } from "../config/app-config.ts";
import { measureDisplayWidth } from "../display-width.ts";
import { compareSemver, isSemver as isValidSemver } from "../semver.ts";
import { createWriterColors } from "../terminal-colors.ts";

const cliLatestReleaseMetadataUrl = "https://static.oomol.com/release/apps/oo-cli/latest.json";
export const cliUpdateCommand = `${APP_NAME} update`;
const updateRequestTimeoutMs = 2000;
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
            },
            "CLI update check started.",
        );
        const latestVersion = await fetchLatestReleaseVersion({
            currentVersion: context.version,
            fetcher: context.fetcher,
            logger: context.logger,
        });

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

        if (compareSemver(latestVersion, context.version) <= 0) {
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

async function fetchLatestReleaseVersion(options: {
    currentVersion: string;
    fetcher: Fetcher;
    logger: CliExecutionContext["logger"];
}): Promise<string | null> {
    const requestStartedAt = Date.now();

    options.logger.debug(
        {
            requestUrl: cliLatestReleaseMetadataUrl,
            timeoutMs: updateRequestTimeoutMs,
        },
        "CLI update latest-release request started.",
    );

    const response = await fetchWithTimeout(
        options.fetcher,
        cliLatestReleaseMetadataUrl,
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
                requestUrl: cliLatestReleaseMetadataUrl,
                timeoutMs: updateRequestTimeoutMs,
            },
            "CLI update latest-release request timed out or failed.",
        );
        return null;
    }

    if (!response.ok) {
        options.logger.warn(
            {
                durationMs: Date.now() - requestStartedAt,
                requestUrl: cliLatestReleaseMetadataUrl,
                status: response.status,
            },
            "CLI update latest-release request returned a non-success status.",
        );
        return null;
    }

    const latestVersion = await extractLatestVersionFromPayload(response);

    if (latestVersion === null) {
        options.logger.warn(
            {
                durationMs: Date.now() - requestStartedAt,
                requestUrl: cliLatestReleaseMetadataUrl,
                status: response.status,
            },
            "CLI update latest-release response did not include a valid version.",
        );
        return null;
    }

    options.logger.debug(
        {
            durationMs: Date.now() - requestStartedAt,
            latestVersion,
            requestUrl: cliLatestReleaseMetadataUrl,
            status: response.status,
        },
        "CLI update latest-release request completed.",
    );

    return latestVersion;
}

const latestReleaseMetadataSchema = z.object({
    version: z.string().min(1).refine(isValidSemver),
});

async function extractLatestVersionFromPayload(
    response: Response,
): Promise<string | null> {
    let payload: unknown;

    try {
        payload = await response.json();
    }
    catch {
        return null;
    }

    const result = latestReleaseMetadataSchema.safeParse(payload);

    return result.success ? result.data.version : null;
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
