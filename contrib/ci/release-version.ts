export type VersionBump = "patch" | "minor" | "major";

export interface ReleaseVersionResult {
    version: string;
    tagName: string;
    previousTag: string;
}

function isAsciiDigit(character: string): boolean {
    return character >= "0" && character <= "9";
}

function isNumericSegment(segment: string): boolean {
    return segment !== "" && Array.from(segment).every(isAsciiDigit);
}

export function isStableSemver(version: string): boolean {
    const segments = version.split(".");
    return segments.length === 3 && segments.every(isNumericSegment);
}

export function parseStableTag(tag: string): string | undefined {
    if (!tag.startsWith("v")) {
        return undefined;
    }

    const version = tag.slice(1);
    return isStableSemver(version) ? version : undefined;
}

export function normalizeExpectedVersion(expectedVersion: string): string {
    const normalizedVersion = expectedVersion.startsWith("v")
        ? expectedVersion.slice(1)
        : expectedVersion;

    if (!isStableSemver(normalizedVersion)) {
        throw new Error("Expected version must use the X.Y.Z format.");
    }

    return normalizedVersion;
}

export function findLatestStableTag(tags: readonly string[]): string {
    for (const tag of tags) {
        if (parseStableTag(tag) !== undefined) {
            return tag;
        }
    }

    return "";
}

export function bumpVersion(version: string, versionBump: VersionBump): string {
    const segments = version.split(".");
    if (segments.length !== 3) {
        throw new Error(`Invalid stable version: ${version}`);
    }

    const major = Number(segments[0]);
    const minor = Number(segments[1]);
    const patch = Number(segments[2]);

    switch (versionBump) {
        case "major":
            return `${major + 1}.0.0`;
        case "minor":
            return `${major}.${minor + 1}.0`;
        case "patch":
            return `${major}.${minor}.${patch + 1}`;
        default:
            throw new Error("Unsupported version bump.");
    }
}

export function computeReleaseVersion(input: {
    expectedVersion: string;
    versionBump: VersionBump;
    tags: readonly string[];
}): ReleaseVersionResult {
    const previousTag = findLatestStableTag(input.tags);

    const version = input.expectedVersion === ""
        ? bumpVersion(previousTag === "" ? "0.0.0" : previousTag.slice(1), input.versionBump)
        : normalizeExpectedVersion(input.expectedVersion);

    const tagName = `v${version}`;
    if (input.tags.includes(tagName)) {
        throw new Error(`Tag ${tagName} already exists.`);
    }

    return {
        version,
        tagName,
        previousTag,
    };
}

export function formatGitHubOutput(result: ReleaseVersionResult): string {
    return [
        `version=${result.version}`,
        `tag_name=${result.tagName}`,
        `previous_tag=${result.previousTag}`,
        "",
    ].join("\n");
}

export function readVersionBump(value: string | undefined): VersionBump {
    if (value === "major" || value === "minor" || value === "patch") {
        return value;
    }

    throw new Error(`Unsupported version bump: ${value ?? ""}`);
}
