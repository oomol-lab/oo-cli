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

    return BUILD_VERSION.trim() || fallbackVersion;
}

function readBuildTimestamp(): number | undefined {
    let rawTimestamp: number | undefined;

    if (typeof BUILD_TIMESTAMP === "number") {
        rawTimestamp = BUILD_TIMESTAMP;
    }
    else if (typeof BUILD_TIMESTAMP === "string") {
        rawTimestamp = Number(BUILD_TIMESTAMP);
    }

    if (rawTimestamp === undefined || !Number.isFinite(rawTimestamp)) {
        return undefined;
    }

    return rawTimestamp;
}

function readCommitHash(): string | undefined {
    if (typeof GIT_COMMIT !== "string") {
        return undefined;
    }

    return GIT_COMMIT.trim() || undefined;
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
    return commitHash?.slice(0, 8) ?? unknownValue;
}
