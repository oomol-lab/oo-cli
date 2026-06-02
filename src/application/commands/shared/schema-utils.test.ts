import { describe, expect, test } from "bun:test";

import { isPlainObject } from "./schema-utils.ts";

describe("schema utils", () => {
    test("identifies plain objects and null-prototype objects", () => {
        expect(isPlainObject({})).toBe(true);
        expect(isPlainObject(Object.create(null))).toBe(true);
        expect(isPlainObject([])).toBe(false);
        expect(isPlainObject(new URL("https://example.com"))).toBe(false);
    });
});
