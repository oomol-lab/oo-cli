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

    test("resolves the message for the requested locale", () => {
        expect(createTranslator("zh").t("labels.status")).toBe("状态");
        expect(createTranslator("en").t("labels.status")).toBe("Status");
    });

    // The remaining branch, falling back to the English message when a locale
    // lacks the key, cannot be exercised against the real catalog: the
    // "both locales declare the same key set" test in catalog.test.ts makes an
    // English-only key impossible to ship, so the branch is defensive only.
    test("returns the key itself when no message exists", () => {
        expect(createTranslator("zh").t("no.such.key")).toBe("no.such.key");
        expect(createTranslator("en").t("no.such.key")).toBe("no.such.key");
    });
});
