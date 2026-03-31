import { describe, expect, test } from "bun:test";

import { renderSkillMetadataJson } from "./bundled-skill-model.ts";
import {
    parseManagedSkillMetadataContent,
} from "./managed-skill-metadata.ts";

describe("managed skill metadata", () => {
    test("parses version-only metadata", () => {
        expect(
            parseManagedSkillMetadataContent(
                JSON.stringify({
                    version: "1.2.3",
                }),
            ),
        ).toEqual({
            packageName: undefined,
            version: "1.2.3",
        });
    });

    test("parses package-backed metadata", () => {
        expect(
            parseManagedSkillMetadataContent(
                JSON.stringify({
                    packageName: "@foo/bar",
                    version: "1.2.3",
                }),
            ),
        ).toEqual({
            packageName: "@foo/bar",
            version: "1.2.3",
        });
    });

    test("rejects metadata with an empty version", () => {
        expect(
            parseManagedSkillMetadataContent(
                JSON.stringify({
                    version: "",
                }),
            ),
        ).toBeUndefined();
    });

    test("renders metadata with packageName when present", () => {
        expect(
            renderSkillMetadataJson({
                packageName: "openai",
                version: "0.0.3",
            }),
        ).toBe(
            [
                "{",
                "  \"packageName\": \"openai\",",
                "  \"version\": \"0.0.3\"",
                "}",
                "",
            ].join("\n"),
        );
    });
});
