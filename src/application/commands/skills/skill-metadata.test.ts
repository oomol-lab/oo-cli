import { describe, expect, test } from "bun:test";

import {
    createBundledSkillMetadata,
    createLocalSkillMetadata,
    createRegistrySkillMetadata,
    parseSkillMetadataContent,
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

    test("trims surrounding whitespace from typed identity fields", () => {
        expect(parseSkillMetadataContent(JSON.stringify({
            kind: "bundled",
            schemaVersion: 1,
            version: " 1.2.3 ",
        }))).toEqual(createBundledSkillMetadata("1.2.3"));
        expect(parseSkillMetadataContent(JSON.stringify({
            icon: " star ",
            kind: "registry",
            packageName: " @foo/bar ",
            schemaVersion: 1,
            version: " 2.0.0 ",
        }))).toEqual(createRegistrySkillMetadata({
            icon: "star",
            packageName: "@foo/bar",
            version: "2.0.0",
        }));
    });

    test("rejects typed metadata with blank identity fields", () => {
        expect(parseSkillMetadataContent(JSON.stringify({
            kind: "bundled",
            schemaVersion: 1,
            version: "",
        }))).toBeUndefined();
        expect(parseSkillMetadataContent(JSON.stringify({
            kind: "registry",
            packageName: "  ",
            schemaVersion: 1,
            version: "1.2.3",
        }))).toBeUndefined();
        expect(parseSkillMetadataContent(JSON.stringify({
            icon: "  ",
            kind: "registry",
            packageName: "@foo/bar",
            schemaVersion: 1,
            version: "1.2.3",
        }))).toBeUndefined();
    });

    test("rejects legacy untyped metadata", () => {
        expect(parseSkillMetadataContent("{\"version\":\" 1.2.3 \"}\n"))
            .toBeUndefined();
        expect(parseSkillMetadataContent(JSON.stringify({
            packageName: "@foo/bar",
            version: "2.0.0",
        }))).toBeUndefined();
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

    test("renders metadata as formatted JSON with a trailing newline", () => {
        expect(renderSkillMetadataJson({ version: "1.2.3" })).toBe(
            "{\n  \"version\": \"1.2.3\"\n}\n",
        );
        expect(renderSkillMetadataJson(createRegistrySkillMetadata({
            packageName: "openai",
            version: "0.0.3",
        }))).toBe(
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
