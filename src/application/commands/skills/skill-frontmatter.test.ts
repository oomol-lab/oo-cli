import { describe, expect, test } from "bun:test";

import {
    hasFrontmatter,
    parseSkillMarkdownMatter,
    stringifySkillMarkdownMatter,
} from "./skill-frontmatter.ts";

describe("skill frontmatter helpers", () => {
    test("detects frontmatter delimiters after leading whitespace", () => {
        expect(hasFrontmatter("---\nname: demo\n---\n")).toBeTrue();
        expect(hasFrontmatter("\n---\nname: demo\n---\n")).toBeTrue();
        expect(hasFrontmatter("# Demo\n")).toBeFalse();
    });

    test("serializes long frontmatter scalars without folded block markers", () => {
        const description
            = "Use a known package workflow to prepare reusable release notes for product launches across several teams.";
        const rendered = stringifySkillMarkdownMatter("\n# Demo\n", {
            description,
            name: "demo",
        });

        expect(rendered).not.toContain([">", "-"].join(""));
        expect(rendered).toContain(`description: ${description}`);
        expect(parseSkillMarkdownMatter(rendered).data).toMatchObject({
            description,
            name: "demo",
        });
    });
});
