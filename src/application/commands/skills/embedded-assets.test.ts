import { describe, expect, test } from "bun:test";

import {
    availableBundledSkillAgentNames,
    availableBundledSkillNames,
    getBundledSkillFiles,
} from "./embedded-assets.ts";

describe("embedded skill assets", () => {
    test("keeps the bundled skill file registry aligned with the bundled skill names", () => {
        expect(availableBundledSkillNames).toEqual(["oo", "oo-find-skills"]);
        expect(getBundledSkillFiles("oo", "codex").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/auth-and-billing.md",
            "references/search-and-selection.md",
            "references/package-execution.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
            "references/task-lifecycle.md",
        ]);
        expect(getBundledSkillFiles("oo", "claude").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/search-and-selection.md",
            "references/package-execution.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
            "references/task-lifecycle.md",
        ]);
        expect(getBundledSkillFiles("oo", "openclaw").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/search-and-selection.md",
            "references/package-execution.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
            "references/task-lifecycle.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "codex").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "claude").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "openclaw").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "references/oo-cli-contract.md",
        ]);
    });

    test("maps bundled skills to contrib/skills/<agent>/<skill> source directories", () => {
        expect([...availableBundledSkillAgentNames]).toEqual(["codex", "claude", "openclaw"]);

        for (const skillName of availableBundledSkillNames) {
            for (const agentName of availableBundledSkillAgentNames) {
                const sourceDirectory = `contrib/skills/${agentName}/${skillName}`;
                const skillFiles = getBundledSkillFiles(skillName, agentName);

                expect(skillFiles.every(file => file.agentName === agentName)).toBeTrue();
                expect(
                    skillFiles.every(file =>
                        normalizePathForAssertion(file.sourcePath).includes(
                            `/${sourceDirectory}/`,
                        ),
                    ),
                ).toBeTrue();
            }
        }
    });
});

function normalizePathForAssertion(path: string): string {
    return path.replaceAll("\\", "/");
}
