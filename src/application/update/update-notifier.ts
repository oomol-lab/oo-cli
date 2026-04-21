import type { CliExecutionContext, Fetcher, Writer } from "../contracts/cli.ts";

import type { TerminalColors } from "../terminal-colors.ts";
import { APP_NAME } from "../config/app-config.ts";
import { measureDisplayWidth } from "../display-width.ts";
import { compareSemver, isSemver as isValidSemver } from "../semver.ts";
import { createWriterColors } from "../terminal-colors.ts";
import {
    fetchLatestCliReleaseVersion,
    parseLatestCliSemverReleaseVersion,
} from "./release-metadata.ts";

export const cliUpdateCommand = `${APP_NAME} update`;
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
    return fetchLatestCliReleaseVersion({
        currentVersion: options.currentVersion,
        fetcher: options.fetcher,
        logger: options.logger,
        parseVersion: parseLatestCliSemverReleaseVersion,
    });
}
