import { describe, expect, test } from "bun:test";

import {
    hasFrontmatter,
    isNonBlankString,
    toNonBlankString,
} from "./skill-frontmatter.ts";

describe("skill frontmatter helpers", () => {
    test("detects frontmatter delimiters after leading whitespace", () => {
        expect(hasFrontmatter("---\nname: demo\n---\n")).toBeTrue();
        expect(hasFrontmatter("\n---\nname: demo\n---\n")).toBeTrue();
        expect(hasFrontmatter("# Demo\n")).toBeFalse();
    });

    test("identifies plain records and non-blank strings", () => {
        expect(isNonBlankString(" demo ")).toBeTrue();
        expect(isNonBlankString("   ")).toBeFalse();
        expect(toNonBlankString(" demo ")).toBe("demo");
        expect(toNonBlankString(undefined)).toBeUndefined();
    });
});
