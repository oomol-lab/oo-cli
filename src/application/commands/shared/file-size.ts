// Renders a byte count for humans with binary units, two decimals above bytes.
export function formatFileSize(value: number): string {
    const units = ["B", "KiB", "MiB", "GiB"] as const;
    let unitIndex = 0;
    let size = value;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    const decimalPlaces = unitIndex === 0 ? 0 : 2;

    return `${size.toFixed(decimalPlaces)} ${units[unitIndex]}`;
}
