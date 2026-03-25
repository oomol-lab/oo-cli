import { describe, expect, test } from "bun:test";

import { createTranslator } from "../../i18n/translator.ts";
import {
    formatCliVersionText,
} from "./build-info.ts";

describe("build-info", () => {
    test("formats version metadata in English", () => {
        expect(
            formatCliVersionText(
                {
                    buildTimestamp: Date.UTC(2026, 2, 25, 1, 2, 3, 456),
                    commitHash: "1234567890abcdef",
                    version: "1.2.3",
                },
                createTranslator("en"),
            ),
        ).toBe(
            [
                "Version: 1.2.3",
                "Build Time: 2026-03-25T01:02:03.456Z",
                "Commit: 12345678",
            ].join("\n"),
        );
    });

    test("formats unknown metadata in Chinese", () => {
        expect(
            formatCliVersionText(
                {
                    version: "0.0.0-development",
                },
                createTranslator("zh"),
            ),
        ).toBe(
            [
                "版本: 0.0.0-development",
                "构建时间: 未知",
                "提交: 未知",
            ].join("\n"),
        );
    });
});
