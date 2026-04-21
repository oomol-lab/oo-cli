import type { Logger } from "pino";

import type { Fetcher } from "../contracts/cli.ts";
import { z } from "zod";
import { APP_NAME } from "../config/app-config.ts";
import { isSemver } from "../semver.ts";

export const cliReleaseBaseUrl = "https://static.oomol.com/release/apps/oo-cli";
export const cliLatestReleaseMetadataUrl = `${cliReleaseBaseUrl}/latest.json`;
export const cliReleaseRequestTimeoutMs = 2000;

const latestReleaseVersionSchema = z.object({
    version: z.string().trim().min(1),
});

const latestReleaseSemverVersionSchema = z.object({
    version: z.string().trim().min(1).refine(isSemver),
});

export async function fetchLatestCliReleaseVersion(options: {
    currentVersion: string;
    fetcher: Fetcher;
    logger: Logger;
    parseVersion?: (payload: unknown) => string | null;
    timeoutMs?: number;
}): Promise<string | null> {
    const parseVersion = options.parseVersion ?? parseLatestCliReleaseVersion;
    const timeoutMs = options.timeoutMs ?? cliReleaseRequestTimeoutMs;
    const requestStartedAt = Date.now();

    options.logger.debug(
        {
            requestUrl: cliLatestReleaseMetadataUrl,
            timeoutMs,
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
        timeoutMs,
    );

    if (!response) {
        options.logger.warn(
            {
                durationMs: Date.now() - requestStartedAt,
                requestUrl: cliLatestReleaseMetadataUrl,
                timeoutMs,
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

    let payload: unknown;

    try {
        payload = await response.json();
    }
    catch {
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

    const latestVersion = parseVersion(payload);

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

export function parseLatestCliReleaseVersion(payload: unknown): string | null {
    const result = latestReleaseVersionSchema.safeParse(payload);

    return result.success ? result.data.version : null;
}

export function parseLatestCliSemverReleaseVersion(
    payload: unknown,
): string | null {
    const result = latestReleaseSemverVersionSchema.safeParse(payload);

    return result.success ? result.data.version : null;
}

export function buildCliBinaryDownloadUrl(options: {
    platform: string;
    version: string;
}): string {
    const binaryName = options.platform.startsWith("win32")
        ? "oo.exe"
        : "oo";

    return `${cliReleaseBaseUrl}/${options.version}/${options.platform}/${binaryName}`;
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
