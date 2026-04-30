import { isNonEmptyString, isString, toNonEmptyString } from "@wopjs/cast";

export function hasFrontmatter(content: string): boolean {
    return content.trimStart().startsWith("---");
}

export function isNonBlankString(value: unknown): value is string {
    return isString(value) && isNonEmptyString(value.trim());
}

export function toNonBlankString(value: unknown): string | undefined {
    if (isString(value)) {
        return toNonEmptyString(value.trim());
    }
}
