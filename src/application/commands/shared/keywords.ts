export function parseCommaSeparatedKeywords(
    value: string | undefined,
): string[] {
    if (value === undefined) {
        return [];
    }

    const keywords: string[] = [];
    const seen = new Set<string>();

    for (const segment of value.split(",")) {
        const keyword = segment.trim();

        if (keyword === "" || seen.has(keyword)) {
            continue;
        }

        seen.add(keyword);
        keywords.push(keyword);
    }

    return keywords;
}
