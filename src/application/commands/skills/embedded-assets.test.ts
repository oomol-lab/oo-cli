import { describe, expect, test } from "bun:test";

import {
    availableBundledSkillAgentNames,
    availableBundledSkillNames,
    getBundledSkillAgentName,
    getBundledSkillFiles,
    getBundledSkillSourceDirectory,
} from "./embedded-assets.ts";

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

    test("maps bundled skills to contrib/skills/<agent>/<skill> source directories", () => {
        expect([...availableBundledSkillAgentNames]).toEqual(["codex"]);
        expect(
            Array.from(new Set(availableBundledSkillNames.map(getBundledSkillAgentName))),
        ).toEqual([...availableBundledSkillAgentNames]);

        for (const skillName of availableBundledSkillNames) {
            const sourceDirectory = getBundledSkillSourceDirectory(skillName);
            const agentName = getBundledSkillAgentName(skillName);

            expect(sourceDirectory).toBe(`contrib/skills/${agentName}/${skillName}`);
            expect(
                getBundledSkillFiles(skillName).every(file =>
                    file.agentName === agentName
                    && normalizePathForAssertion(file.sourcePath).includes(`/${sourceDirectory}/`)),
            ).toBeTrue();
        }
    });
});

function normalizePathForAssertion(path: string): string {
    return path.replaceAll("\\", "/");
}
