import { describe, expect, test } from "bun:test";

import { isNonBlankString, toNonBlankString } from "./blank-string.ts";

describe("blank string helpers", () => {
    test("identifies non-blank strings", () => {
        expect(isNonBlankString(" demo ")).toBeTrue();
        expect(isNonBlankString("   ")).toBeFalse();
        expect(isNonBlankString(1)).toBeFalse();
    });

    test("trims non-blank strings and drops blank or non-string values", () => {
        expect(toNonBlankString(" demo ")).toBe("demo");
        expect(toNonBlankString("   ")).toBeUndefined();
        expect(toNonBlankString(undefined)).toBeUndefined();
    });
});
