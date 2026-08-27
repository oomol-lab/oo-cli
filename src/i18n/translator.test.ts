import { describe, expect, test } from "bun:test";

import { createTranslator } from "./translator.ts";

describe("createTranslator", () => {
    test("interpolates named parameters", () => {
        const translator = createTranslator("en");

        expect(translator.t("auth.account.loggedIn", {
            endpoint: "console.oomol.com",
            name: "demo",
        })).toBe("Logged in to console.oomol.com account demo");
    });

    test("treats replacement patterns in a value as literal text", () => {
        const translator = createTranslator("en");

        // `$&`, "$`", `$'` and `$$` are replacement patterns, so a plain
        // replacement string would expand them against the matched
        // placeholder instead of inserting the value the caller passed.
        expect(translator.t("auth.account.loggedIn", {
            endpoint: "$&",
            name: "$$",
        })).toBe("Logged in to $& account $$");
    });

    test("falls back to the english message and then to the key", () => {
        const translator = createTranslator("zh");

        expect(translator.t("labels.status")).toBe("状态");
        expect(translator.t("no.such.key")).toBe("no.such.key");
    });
});
