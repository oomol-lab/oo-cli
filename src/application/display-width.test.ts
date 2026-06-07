import { describe, expect, test } from "bun:test";

import { measureDisplayWidth } from "./display-width.ts";

describe("display width", () => {
    test("measures ASCII and wide characters", () => {
        expect(measureDisplayWidth("abc")).toBe(3);
        expect(measureDisplayWidth("你好")).toBe(4);
        expect(measureDisplayWidth("a你b")).toBe(4);
    });
});
