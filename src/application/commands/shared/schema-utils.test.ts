import { describe, expect, test } from "bun:test";

import { isPlainObject, readWidgetName } from "./schema-utils.ts";

describe("schema utils", () => {
    test("reads widget names only from plain objects", () => {
        expect(readWidgetName({
            widget: "file",
        })).toBe("file");
        expect(readWidgetName({
            widget: 1,
        })).toBeUndefined();
        expect(readWidgetName(["file"])).toBeUndefined();
    });

    test("identifies plain objects and null-prototype objects", () => {
        expect(isPlainObject({})).toBe(true);
        expect(isPlainObject(Object.create(null))).toBe(true);
        expect(isPlainObject([])).toBe(false);
        expect(isPlainObject(new URL("https://example.com"))).toBe(false);
    });
});
