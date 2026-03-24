import { describe, expect, test } from "bun:test";

import {
    detectCliLanguageFlag,
    detectSystemLocale,
    normalizeLocale,
    parseExplicitLocale,
    resolvePreferredLocale,
    resolveRequestLanguage,
} from "./locale.ts";

describe("locale helpers", () => {
    test("normalizes locale variants", () => {
        expect(normalizeLocale("zh-CN")).toBe("zh");
        expect(normalizeLocale("zh_Hans")).toBe("zh");
        expect(normalizeLocale("en-US")).toBe("en");
        expect(normalizeLocale("fr-FR")).toBe("en");
        expect(normalizeLocale(undefined)).toBe("en");
    });

    test("parses explicit locale values strictly", () => {
        expect(parseExplicitLocale("en")).toBe("en");
        expect(parseExplicitLocale("zh")).toBe("zh");
        expect(parseExplicitLocale("zh-CN")).toBeUndefined();
        expect(parseExplicitLocale("fr")).toBeUndefined();
    });

    test("detects language flags from argv", () => {
        expect(detectCliLanguageFlag(["--lang", "zh"])).toBe("zh");
        expect(detectCliLanguageFlag(["config", "get", "lang", "--lang=en"])).toBe("en");
        expect(detectCliLanguageFlag(["config", "--lang"])).toBeUndefined();
    });

    test("resolves locale with the expected precedence", () => {
        const env = {
            LANG: "zh-CN",
            LC_ALL: undefined,
            LC_MESSAGES: undefined,
        };

        expect(resolvePreferredLocale({
            cliFlag: "en",
            storedLocale: "zh",
            env,
            systemLocale: "zh-CN",
        })).toBe("en");

        expect(resolvePreferredLocale({
            storedLocale: "zh",
            env: {
                LANG: "en-US",
            },
            systemLocale: "en-US",
        })).toBe("zh");

        expect(detectSystemLocale({
            LC_ALL: "zh-CN",
            LC_MESSAGES: "en-US",
            LANG: "en-US",
        })).toBe("zh");

        expect(resolvePreferredLocale({
            env: {
                LANG: undefined,
                LC_ALL: undefined,
                LC_MESSAGES: undefined,
            },
            systemLocale: "zh-TW",
        })).toBe("zh");
    });

    test("maps locales to request language values", () => {
        expect(resolveRequestLanguage("en")).toBe("en");
        expect(resolveRequestLanguage("zh")).toBe("zh-CN");
    });
});
