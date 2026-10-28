import {
    isNonEmptyString,
    isString,
    toNonEmptyString,
} from "@wopjs/cast";

// Kept apart from skill-frontmatter.ts so modules that only need these checks,
// such as the startup skills sync, do not load the YAML frontmatter parser.
export function isNonBlankString(value: unknown): value is string {
    return isString(value) && isNonEmptyString(value.trim());
}

export function toNonBlankString(value: unknown): string | undefined {
    if (isString(value)) {
        return toNonEmptyString(value.trim());
    }
}
