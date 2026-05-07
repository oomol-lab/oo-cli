export function isUuidV7(value: string): boolean {
    const parts = value.split("-");
    const expectedLengths = [8, 4, 4, 4, 12] as const;

    if (parts.length !== expectedLengths.length) {
        return false;
    }

    for (const [index, expectedLength] of expectedLengths.entries()) {
        const part = parts[index]!;

        if (part.length !== expectedLength || !isHexString(part)) {
            return false;
        }
    }

    return parts[2]![0] === "7" && isUuidVariant(parts[3]![0]!);
}

function isHexString(value: string): boolean {
    for (const char of value) {
        const lower = char.toLowerCase();

        if (
            !(
                (lower >= "0" && lower <= "9")
                || (lower >= "a" && lower <= "f")
            )
        ) {
            return false;
        }
    }

    return true;
}

function isUuidVariant(char: string): boolean {
    const lower = char.toLowerCase();

    return lower === "8"
        || lower === "9"
        || lower === "a"
        || lower === "b";
}
