import { describe, expect, test } from "bun:test";
import { filterSkillSyncRecords } from "./sync.ts";

describe("skills sync", () => {
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
