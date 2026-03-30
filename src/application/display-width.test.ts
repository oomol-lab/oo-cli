import { describe, expect, test } from "bun:test";

import {
    measureDisplayWidth,
    truncateDisplayWidth,
} from "./display-width.ts";

describe("display width", () => {
    test("measures ASCII and wide characters", () => {
        expect(measureDisplayWidth("abc")).toBe(3);
        expect(measureDisplayWidth("你好")).toBe(4);
        expect(measureDisplayWidth("a你b")).toBe(4);
    });

    test("truncates by visible width", () => {
        expect(truncateDisplayWidth("hello world", 8)).toBe("hello...");
        expect(truncateDisplayWidth("你好世界", 5)).toBe("你...");
        expect(truncateDisplayWidth("abc", 2)).toBe("ab");
    });
});
