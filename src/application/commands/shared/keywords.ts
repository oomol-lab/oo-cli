import { parseCommaSeparatedValues } from "./list-parsing.ts";

export function parseCommaSeparatedKeywords(
    value: string | undefined,
): string[] {
    return parseCommaSeparatedValues(value === undefined ? undefined : [value]);
}
