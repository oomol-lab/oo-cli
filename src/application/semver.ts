export function isSemver(value: string): boolean {
    return parseSemver(value) !== null;
}

export function compareSemver(left: string, right: string): number {
    const parsedLeft = parseSemver(left);
    const parsedRight = parseSemver(right);

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

interface ParsedSemver {
    core: readonly [number, number, number];
    prerelease: readonly (number | string)[];
}

function parseSemver(value: string): ParsedSemver | null {
    if (value === "") {
        return null;
    }

    const [versionWithoutBuild, buildMetadata] = splitSection(value, "+");
    const [coreVersion, prereleaseVersion] = splitSection(versionWithoutBuild, "-");
    const coreParts = coreVersion.split(".");

    if (coreParts.length !== 3) {
        return null;
    }

    const parsedCore = coreParts.map(parseNumericIdentifier);

    if (parsedCore.includes(null)) {
        return null;
    }

    if (buildMetadata !== undefined && !isBuildMetadataIdentifierList(buildMetadata)) {
        return null;
    }

    const prereleaseParts = prereleaseVersion === undefined
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

function splitSection(
    value: string,
    separator: string,
): [string, string | undefined] {
    const separatorIndex = value.indexOf(separator);

    if (separatorIndex < 0) {
        return [value, undefined];
    }

    return [
        value.slice(0, separatorIndex),
        value.slice(separatorIndex + separator.length),
    ];
}

// Build metadata allows leading-zero numeric identifiers per the semver spec,
// so this only checks that each dot-separated identifier is non-empty and
// contains only ASCII alphanumerics and hyphens.
function isBuildMetadataIdentifierList(value: string): boolean {
    return value !== "" && value.split(".").every(isIdentifier);
}

function isIdentifier(value: string): boolean {
    if (value === "") {
        return false;
    }

    return Array.from(value).every(character =>
        isAsciiDigit(character)
        || isAsciiLetter(character)
        || character === "-",
    );
}

function parseNumericIdentifier(value: string): number | null {
    if (!isDigits(value) || (value.length > 1 && value.startsWith("0"))) {
        return null;
    }

    const parsedValue = Number.parseInt(value, 10);

    return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

function parsePrereleaseIdentifier(value: string): number | string | null {
    if (!isIdentifier(value)) {
        return null;
    }

    if (!isDigits(value)) {
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

function isDigits(value: string): boolean {
    if (value === "") {
        return false;
    }

    return Array.from(value).every(character => isAsciiDigit(character));
}

function isAsciiDigit(character: string): boolean {
    return character >= "0" && character <= "9";
}

function isAsciiLetter(character: string): boolean {
    return (
        (character >= "a" && character <= "z")
        || (character >= "A" && character <= "Z")
    );
}
