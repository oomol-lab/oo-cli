import { describe, expect, test } from "bun:test";

import { parseCommaSeparatedKeywords } from "./keywords.ts";

describe("parseCommaSeparatedKeywords", () => {
    test("trims empty values and removes duplicates", () => {
        expect(parseCommaSeparatedKeywords(" gmail, email ,,gmail, inbox ")).toEqual([
            "gmail",
            "email",
            "inbox",
        ]);
    });

    test("returns an empty list when the option is omitted", () => {
        expect(parseCommaSeparatedKeywords(undefined)).toEqual([]);
    });
});
