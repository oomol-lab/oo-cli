export function validateMillisecondTimestamp(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${label} timestamp must be a safe integer.`);
    }
}
