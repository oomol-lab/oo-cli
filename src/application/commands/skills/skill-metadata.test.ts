import { describe, expect, test } from "bun:test";

import {
    createBundledSkillMetadata,
    createLocalSkillMetadata,
    createRegistrySkillMetadata,
    parseSkillMetadataContent,
    parseSkillMetadataWithVersion,
    renderSkillMetadataJson,
} from "./skill-metadata.ts";

describe("skill metadata", () => {
    test("parses typed metadata by kind", () => {
        expect(parseSkillMetadataContent(JSON.stringify({
            kind: "bundled",
            schemaVersion: 1,
            version: "1.2.3",
        }))).toEqual(createBundledSkillMetadata("1.2.3"));
        expect(parseSkillMetadataContent(JSON.stringify({
            kind: "registry",
            packageName: "@foo/bar",
            schemaVersion: 1,
            version: "2.0.0",
        }))).toEqual(createRegistrySkillMetadata({
            packageName: "@foo/bar",
            version: "2.0.0",
        }));
        expect(parseSkillMetadataContent(JSON.stringify({
            kind: "local",
            schemaVersion: 1,
        }))).toEqual(createLocalSkillMetadata());
    });

    test("parses legacy untyped metadata at the parser boundary", () => {
        expect(parseSkillMetadataContent("{\"version\":\" 1.2.3 \"}\n")).toEqual(
            createBundledSkillMetadata("1.2.3"),
        );
        expect(parseSkillMetadataContent(JSON.stringify({
            packageName: "@foo/bar",
            version: "2.0.0",
        }))).toEqual(createRegistrySkillMetadata({
            packageName: "@foo/bar",
            version: "2.0.0",
        }));
    });

    test("rejects unsupported typed metadata", () => {
        expect(parseSkillMetadataContent(JSON.stringify({
            kind: "local",
            schemaVersion: 2,
        }))).toBeUndefined();
        expect(parseSkillMetadataContent(JSON.stringify({
            kind: "registry",
            packageName: "@foo/bar",
            schemaVersion: 1,
        }))).toBeUndefined();
    });

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
