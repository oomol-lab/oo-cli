import type { Translator } from "../contracts/translator.ts";

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

export function formatCliVersionText(
    buildInfo: CliBuildInfo,
    translator: Translator,
): string {
    const unknownValue = translator.t("versionInfo.unknown");

    return [
        `${translator.t("versionInfo.version")}: ${buildInfo.version}`,
        `${translator.t("versionInfo.buildTime")}: ${formatBuildTime(
            buildInfo.buildTimestamp,
            unknownValue,
        )}`,
        `${translator.t("versionInfo.commit")}: ${formatCommitHash(
            buildInfo.commitHash,
            unknownValue,
        )}`,
    ].join("\n");
}

function readBuildVersion(fallbackVersion: string): string {
    if (typeof BUILD_VERSION !== "string") {
        return fallbackVersion;
    }

    const normalizedVersion = BUILD_VERSION.trim();

    return normalizedVersion === "" ? fallbackVersion : normalizedVersion;
}

function readBuildTimestamp(): number | undefined {
    let rawTimestamp: number | undefined;

    if (typeof BUILD_TIMESTAMP === "number") {
        rawTimestamp = BUILD_TIMESTAMP;
    }
    else if (typeof BUILD_TIMESTAMP === "string") {
        rawTimestamp = Number(BUILD_TIMESTAMP);
    }

    if (typeof rawTimestamp !== "number" || !Number.isFinite(rawTimestamp)) {
        return undefined;
    }

    return rawTimestamp;
}

function readCommitHash(): string | undefined {
    if (typeof GIT_COMMIT !== "string") {
        return undefined;
    }

    const normalizedCommitHash = GIT_COMMIT.trim();

    return normalizedCommitHash === "" ? undefined : normalizedCommitHash;
}

function formatBuildTime(
    buildTimestamp: number | undefined,
    unknownValue: string,
): string {
    if (buildTimestamp === undefined) {
        return unknownValue;
    }

    const buildTime = new Date(buildTimestamp);

    if (Number.isNaN(buildTime.getTime())) {
        return unknownValue;
    }

    return buildTime.toISOString();
}

function formatCommitHash(
    commitHash: string | undefined,
    unknownValue: string,
): string {
    if (commitHash === undefined) {
        return unknownValue;
    }

    return commitHash.slice(0, 8);
}
