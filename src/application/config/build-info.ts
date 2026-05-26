import type { Translator } from "../contracts/translator.ts";

const COMMIT_HASH_DISPLAY_LENGTH = 8;

export interface CliBuildInfo {
    buildTimestamp?: number;
    commitHash?: string;
    version: string;
}

export function resolveCliBuildInfo(fallbackVersion: string): CliBuildInfo {
    return {
        buildTimestamp: readBuildTimestamp(),
        commitHash: readCommitHash(),
        version: readBuildVersion(fallbackVersion),
    };
}

export function formatBuildTimestampIso(
    buildTimestamp: number | undefined,
): string | undefined {
    if (buildTimestamp === undefined) {
        return undefined;
    }

    return new Date(buildTimestamp).toISOString();
}

export function shortenCommitHash(
    commitHash: string | undefined,
): string | undefined {
    return commitHash?.slice(0, COMMIT_HASH_DISPLAY_LENGTH);
}

export function formatCliVersionText(
    buildInfo: CliBuildInfo,
    translator: Translator,
): string {
    const unknownValue = translator.t("versionInfo.unknown");

    return [
        `${translator.t("labels.version")}: ${buildInfo.version}`,
        `${translator.t("versionInfo.buildTime")}: ${
            formatBuildTimestampIso(buildInfo.buildTimestamp) ?? unknownValue
        }`,
        `${translator.t("versionInfo.commit")}: ${
            shortenCommitHash(buildInfo.commitHash) ?? unknownValue
        }`,
    ].join("\n");
}

function readBuildVersion(fallbackVersion: string): string {
    if (typeof BUILD_VERSION !== "string") {
        return fallbackVersion;
    }

    return BUILD_VERSION.trim() || fallbackVersion;
}

function readBuildTimestamp(): number | undefined {
    if (typeof BUILD_TIMESTAMP === "number") {
        return Number.isFinite(BUILD_TIMESTAMP) ? BUILD_TIMESTAMP : undefined;
    }
    if (typeof BUILD_TIMESTAMP === "string") {
        const parsed = Number(BUILD_TIMESTAMP);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

function readCommitHash(): string | undefined {
    if (typeof GIT_COMMIT !== "string") {
        return undefined;
    }

    return GIT_COMMIT.trim() || undefined;
}
