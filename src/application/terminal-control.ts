const controlSequencePrefix = "\u001B[";
const carriageReturn = "\r";
const clearLine = `${controlSequencePrefix}2K`;

export const terminalControl = {
    hideCursor: `${controlSequencePrefix}?25l`,
    showCursor: `${controlSequencePrefix}?25h`,
} as const;

export function moveCursorUp(lineCount: number): string {
    if (!Number.isInteger(lineCount) || lineCount < 0) {
        throw new TypeError("lineCount must be a non-negative integer.");
    }

    if (lineCount === 0) {
        return "";
    }

    return `${controlSequencePrefix}${lineCount}A`;
}

export function rewriteTerminalLine(line: string): string {
    return `${carriageReturn}${clearLine}${line}`;
}

export function rewriteTerminalLines(lines: readonly string[]): string {
    return lines.map(rewriteTerminalLine).join("\n");
}
