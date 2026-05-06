import { describe, expect, test } from "bun:test";
import { CliUserError } from "../../contracts/cli.ts";
import {
    createSkillSyncRequestUrl,
    filterSkillSyncRecords,
    parseSkillSyncResponse,
} from "./sync.ts";

describe("skills sync", () => {
    test("creates the sync API request URL", () => {
        expect(createSkillSyncRequestUrl("oomol.com").toString()).toBe(
            "https://api.oomol.com/v1/skills",
        );
    });

    test("parses skill sync records", () => {
        expect(parseSkillSyncResponse(JSON.stringify([
            {
                packageName: "@oomol/text-tools",
                skillName: "summarize",
                version: "1.2.3",
            },
        ]))).toEqual([
            {
                packageName: "@oomol/text-tools",
                skillName: "summarize",
                version: "1.2.3",
            },
        ]);
    });

    test("rejects unsupported sync responses", () => {
        expect(() => parseSkillSyncResponse(JSON.stringify({
            packageName: "@oomol/text-tools",
        }))).toThrow(CliUserError);
    });

    test("filters sync records by package and skill patterns", () => {
        const records = [
            {
                packageName: "@oomol/text-tools",
                skillName: "summarize",
                version: "1.2.3",
            },
            {
                packageName: "@private/vision",
                skillName: "caption",
                version: "2.0.0",
            },
            {
                packageName: "openai",
                skillName: "chatgpt",
                version: "0.0.3",
            },
        ];

        expect(filterSkillSyncRecords(records, ["@private/*", "chat*"])).toEqual([
            {
                packageName: "@oomol/text-tools",
                skillName: "summarize",
                version: "1.2.3",
            },
        ]);
    });
});
