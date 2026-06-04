import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
    normalizeSkillFilterTokens,
    selectSkillsByFilter,
    skillMatchesFilterTokens,
} from "./skill-filter.ts";

describe("normalizeSkillFilterTokens", () => {
    test("returns undefined for undefined input", () => {
        expect(normalizeSkillFilterTokens(undefined)).toBeUndefined();
    });

    test("returns undefined when every token is blank", () => {
        expect(normalizeSkillFilterTokens(["", "   "])).toBeUndefined();
    });

    test("trims, lowercases, and de-duplicates tokens", () => {
        const tokens = normalizeSkillFilterTokens([" Foo ", "foo", "BAR"]);

        expect(tokens).toEqual(new Set(["foo", "bar"]));
    });
});

describe("skillMatchesFilterTokens", () => {
    test("matches the skill name case-insensitively", () => {
        expect(
            skillMatchesFilterTokens({ name: "Demo" }, new Set(["demo"])),
        ).toBeTrue();
    });

    test("matches the path basename when the name differs", () => {
        const candidate = { name: "logical-name", path: join("a", "b", "Display-Name") };

        expect(
            skillMatchesFilterTokens(candidate, new Set(["display-name"])),
        ).toBeTrue();
    });

    test("does not match when neither name nor basename is requested", () => {
        expect(
            skillMatchesFilterTokens(
                { name: "demo", path: join("x", "demo") },
                new Set(["other"]),
            ),
        ).toBeFalse();
    });
});

describe("selectSkillsByFilter", () => {
    test("keeps only matching candidates and ignores unknown tokens", () => {
        const candidates = [
            { name: "foo" },
            { name: "bar" },
            { name: "baz" },
        ];
        // Tokens flow through normalization (lowercase) before matching, so the
        // mixed-case "FOO" still matches the "foo" candidate.
        const tokens = normalizeSkillFilterTokens(["FOO", "baz", "missing"])!;

        const selected = selectSkillsByFilter(candidates, tokens);

        expect(selected.map(candidate => candidate.name)).toEqual(["foo", "baz"]);
    });

    test("returns an empty array when no candidate matches", () => {
        const selected = selectSkillsByFilter(
            [{ name: "foo" }],
            new Set(["nope"]),
        );

        expect(selected).toEqual([]);
    });
});
