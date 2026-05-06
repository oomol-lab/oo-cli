export function parseCommaSeparatedValues(
    values: readonly string[] | undefined,
): string[] {
    if (!values) {
        return [];
    }

    const parsedValues: string[] = [];
    const seen = new Set<string>();

    for (const value of values) {
        for (const segment of value.split(",")) {
            const parsedValue = segment.trim();

            if (parsedValue === "" || seen.has(parsedValue)) {
                continue;
            }

            seen.add(parsedValue);
            parsedValues.push(parsedValue);
        }
    }

    return parsedValues;
}
