import { describe, expect, test } from "bun:test";

import {
    parseSkillMetadataWithVersion,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

describe("skill metadata", () => {
    test("parses metadata when version is present and trims surrounding whitespace", () => {
        expect(parseSkillMetadataWithVersion("{\"version\":\" 1.2.3 \"}\n")).toEqual({
            fields: {
                version: " 1.2.3 ",
            },
            version: "1.2.3",
        });
    });

    test("rejects metadata without a non-empty string version", () => {
        expect(parseSkillMetadataWithVersion("not json")).toBeUndefined();
        expect(parseSkillMetadataWithVersion("[]")).toBeUndefined();
        expect(parseSkillMetadataWithVersion("{}")).toBeUndefined();
        expect(parseSkillMetadataWithVersion("{\"version\":1}")).toBeUndefined();
        expect(parseSkillMetadataWithVersion("{\"version\":\"\"}")).toBeUndefined();
    });

    test("renders metadata as formatted JSON with a trailing newline", () => {
        expect(renderSkillMetadataJson({ version: "1.2.3" })).toBe(
            "{\n  \"version\": \"1.2.3\"\n}\n",
        );
    });
});
