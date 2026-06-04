import { basename } from "node:path";

export function isSkillIdReference(value: string): boolean {
    const trimmedValue = value.trim();

    return trimmedValue !== ""
        && trimmedValue !== "."
        && trimmedValue !== ".."
        && basename(trimmedValue) === trimmedValue;
}

export function normalizeSkillName(value: string): string {
    const normalizedCharacters: string[] = [];
    let previousWasHyphen = false;

    for (const char of value.trim().toLowerCase()) {
        if (isLowercaseAsciiLetter(char) || isAsciiDigit(char)) {
            normalizedCharacters.push(char);
            previousWasHyphen = false;
            continue;
        }

        if (!previousWasHyphen && normalizedCharacters.length > 0) {
            normalizedCharacters.push("-");
            previousWasHyphen = true;
        }
    }

    if (normalizedCharacters.at(-1) === "-") {
        normalizedCharacters.pop();
    }

    let result = normalizedCharacters.join("").slice(0, 64);

    while (result.endsWith("-")) {
        result = result.slice(0, -1);
    }

    return result;
}

function isLowercaseAsciiLetter(char: string): boolean {
    return char >= "a" && char <= "z";
}

function isAsciiDigit(char: string): boolean {
    return char >= "0" && char <= "9";
}
