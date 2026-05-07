import {
    isNonEmptyString,
    isPlainObject,
    isString,
    toNonEmptyString,
} from "@wopjs/cast";
import matter from "gray-matter";

export type SkillFrontmatterRecord = Record<PropertyKey, unknown>;

export interface SkillMarkdownMatter {
    content: string;
    data: SkillFrontmatterRecord;
}

interface SkillMarkdownMatterStringifyOptions
    extends matter.GrayMatterOption<string, SkillMarkdownMatterStringifyOptions> {
    lineWidth: number;
}

const skillMarkdownMatterStringifyOptions: SkillMarkdownMatterStringifyOptions = {
    lineWidth: -1,
};

export function hasFrontmatter(content: string): boolean {
    return content.trimStart().startsWith("---");
}

export function parseSkillMarkdownMatter(content: string): SkillMarkdownMatter {
    const parsed = matter(content);

    return {
        content: parsed.content,
        data: parsed.data,
    };
}

export function isSkillFrontmatterRecord(
    value: unknown,
): value is SkillFrontmatterRecord {
    return isPlainObject(value);
}

export function stringifySkillMarkdownMatter(
    content: string,
    data: object,
): string {
    return matter.stringify(content, data, skillMarkdownMatterStringifyOptions);
}

export function isNonBlankString(value: unknown): value is string {
    return isString(value) && isNonEmptyString(value.trim());
}

export function toNonBlankString(value: unknown): string | undefined {
    if (isString(value)) {
        return toNonEmptyString(value.trim());
    }
}
