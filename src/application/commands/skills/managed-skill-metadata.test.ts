import { describe, expect, test } from "bun:test";

import {
    parseManagedSkillMetadataContent,
} from "./managed-skill-metadata.ts";
import {
    createRegistrySkillMetadata,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

describe("managed skill metadata", () => {
    test("rejects version-only bundled metadata", () => {
        expect(
            parseManagedSkillMetadataContent(
                JSON.stringify({
                    version: "1.2.3",
                }),
            ),
        ).toBeUndefined();
    });

    test("parses package-backed metadata", () => {
        expect(
            parseManagedSkillMetadataContent(
                JSON.stringify({
                    packageName: "@foo/bar",
                    version: "1.2.3",
                }),
            ),
        ).toEqual(createRegistrySkillMetadata({
            packageName: "@foo/bar",
            version: "1.2.3",
        }));
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

    test("rejects metadata with an empty packageName", () => {
        expect(
            parseManagedSkillMetadataContent(
                JSON.stringify({
                    packageName: "  ",
                    version: "1.2.3",
                }),
            ),
        ).toBeUndefined();
    });

    test("renders metadata with packageName when present", () => {
        expect(
            renderSkillMetadataJson({
                kind: "registry",
                packageName: "openai",
                schemaVersion: 1,
                version: "0.0.3",
            }),
        ).toBe(
            [
                "{",
                "  \"kind\": \"registry\",",
                "  \"packageName\": \"openai\",",
                "  \"schemaVersion\": 1,",
                "  \"version\": \"0.0.3\"",
                "}",
                "",
            ].join("\n"),
        );
    });
});
