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

    for (let index = 0; index < value.length; index += 1) {
        const codePoint = value.codePointAt(index);

        if (codePoint === undefined) {
            continue;
        }

        width += isWideCodePoint(codePoint) ? 2 : 1;

        if (codePoint > 0xFFFF) {
            index += 1;
        }
    }

    return width;
}

function sliceDisplayWidth(value: string, maxWidth: number): string {
    let result = "";
    let width = 0;

    for (let index = 0; index < value.length; index += 1) {
        const codePoint = value.codePointAt(index);

        if (codePoint === undefined) {
            continue;
        }

        const segment = String.fromCodePoint(codePoint);
        const nextWidth = width + (isWideCodePoint(codePoint) ? 2 : 1);

        if (nextWidth > maxWidth) {
            break;
        }

        result += segment;
        width = nextWidth;

        if (codePoint > 0xFFFF) {
            index += 1;
        }
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
    );
}
