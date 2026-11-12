// The `--timeout` duration: `5m`, `90s`, `2h`, `1500ms`, or a bare number of
// seconds. "ms" is listed first so it wins over the "s" it ends with.
const durationUnits = [["ms", 1], ["s", 1_000], ["m", 60_000], ["h", 3_600_000]] as const;

/** Returns the duration in milliseconds, or undefined when the text is not a positive duration. */
export function parseDuration(value: string): number | undefined {
    const text = value.trim().toLowerCase();
    const unit = durationUnits.find(([suffix]) => text.endsWith(suffix));
    const amountText = unit === undefined ? text : text.slice(0, -unit[0].length).trimEnd();

    if (!isDecimalNumber(amountText)) {
        return undefined;
    }

    const milliseconds = Math.round(Number(amountText) * (unit?.[1] ?? 1_000));

    return Number.isFinite(milliseconds) && milliseconds > 0 ? milliseconds : undefined;
}

export function formatDuration(milliseconds: number): string {
    if (milliseconds < 1_000) {
        return `${milliseconds}ms`;
    }

    const seconds = Math.round(milliseconds / 1_000);

    if (seconds < 60) {
        return `${seconds}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;

    return rest === 0 ? `${minutes}m` : `${minutes}m${rest}s`;
}

// Digits with at most one decimal point between them: "5", "1.5".
function isDecimalNumber(text: string): boolean {
    const parts = text.split(".");

    return parts.length <= 2 && parts.every(part => part !== "" && isDigits(part));
}

export function isDigits(text: string): boolean {
    for (const character of text) {
        if (character < "0" || character > "9") {
            return false;
        }
    }

    return text !== "";
}
