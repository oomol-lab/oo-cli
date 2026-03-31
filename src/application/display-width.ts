export function truncateDisplayWidth(value: string, maxWidth: number): string {
    if (measureDisplayWidth(value) <= maxWidth) {
        return value;
    }

    if (maxWidth <= 3) {
        return sliceDisplayWidth(value, maxWidth);
    }

    return `${sliceDisplayWidth(value, maxWidth - 3)}...`;
}

export function measureDisplayWidth(value: string): number {
    let width = 0;

    for (const char of value) {
        const codePoint = char.codePointAt(0)!;

        width += isWideCodePoint(codePoint) ? 2 : 1;
    }

    return width;
}

function sliceDisplayWidth(value: string, maxWidth: number): string {
    let result = "";
    let width = 0;

    for (const char of value) {
        const codePoint = char.codePointAt(0)!;
        const nextWidth = width + (isWideCodePoint(codePoint) ? 2 : 1);

        if (nextWidth > maxWidth) {
            break;
        }

        result += char;
        width = nextWidth;
    }

    return result;
}

function isWideCodePoint(codePoint: number): boolean {
    return codePoint >= 0x1100 && (
        codePoint <= 0x115F
        || codePoint === 0x2329
        || codePoint === 0x232A
        || (codePoint >= 0x2E80 && codePoint <= 0xA4CF && codePoint !== 0x303F)
        || (codePoint >= 0xAC00 && codePoint <= 0xD7A3)
        || (codePoint >= 0xF900 && codePoint <= 0xFAFF)
        || (codePoint >= 0xFE10 && codePoint <= 0xFE19)
        || (codePoint >= 0xFE30 && codePoint <= 0xFE6F)
        || (codePoint >= 0xFF00 && codePoint <= 0xFF60)
        || (codePoint >= 0xFFE0 && codePoint <= 0xFFE6)
        // CJK Unified Ideographs Extension B
        || (codePoint >= 0x20000 && codePoint <= 0x2A6DF)
        // CJK Unified Ideographs Extensions C through H
        || (codePoint >= 0x2A700 && codePoint <= 0x323AF)
        // CJK Compatibility Ideographs Supplement
        || (codePoint >= 0x2F800 && codePoint <= 0x2FA1F)
    );
}
