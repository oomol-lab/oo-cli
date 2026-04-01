import { describe, expect, test } from "bun:test";

import { availableBundledSkillNames, getBundledSkillFiles } from "./embedded-assets.ts";

describe("embedded skill assets", () => {
    test("keeps the bundled skill file registry aligned with the bundled skill names", () => {
        expect(availableBundledSkillNames).toEqual(["oo", "oo-find-skills"]);
        expect(getBundledSkillFiles("oo").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/oo-cli-contract.md",
        ]);
        expect(getBundledSkillFiles("oo-find-skills").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/oo-cli-contract.md",
        ]);
    });
});
