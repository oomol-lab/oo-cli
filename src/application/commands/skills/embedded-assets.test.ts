import { describe, expect, test } from "bun:test";

import {
    availableBundledSkillAgentNames,
    availableBundledSkillNames,
    getBundledSkillFiles,
} from "./embedded-assets.ts";

describe("embedded skill assets", () => {
    test("keeps the bundled skill file registry aligned with the bundled skill names", () => {
        expect(availableBundledSkillNames).toEqual([
            "oo",
            "oo-find-skills",
            "oo-create-skill",
        ]);
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
        expect(getBundledSkillFiles("oo", "codebuddy").map(file => file.relativePath)).toEqual([
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
        expect(getBundledSkillFiles("oo", "qoderwork").map(file => file.relativePath)).toEqual([
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
            getBundledSkillFiles("oo-find-skills", "codebuddy").map(
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
        expect(
            getBundledSkillFiles("oo-find-skills", "qoderwork").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "codex").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "claude").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "codebuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "openclaw").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "qoderwork").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
    });

    test("maps bundled skills to contrib/skills/<agent>/<skill> source directories", () => {
        expect([...availableBundledSkillAgentNames]).toEqual([
            "codex",
            "claude",
            "codebuddy",
            "openclaw",
            "qoderwork",
        ]);

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

    test("guides oo-create-skill agents to fill presentation metadata", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo-create-skill", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo-create-skill SKILL.md`);
            }

            const content = normalizeLineEndingsForAssertion(
                await Bun.file(skillFile.sourcePath).text(),
            );

            expect(content).toContain("Also pass `--title` and `--icon`.");
            expect(content).toContain(
                "derive a concise display title and suitable icon reference",
            );
            expect(content).toContain(
                "The icon may be an emoji, an image URL, or\n`:collection:icon:`",
            );
            expect(content).toContain("https://icones.js.org/");
            expect(content).toContain(
                "If `metadata.title` or\n`metadata.icon` is absent",
            );
            expect(content).not.toContain(
                "Pass `--title` only when the user provided or confirmed",
            );
            expect(content).not.toContain(
                "do\nnot add it by deriving a title from the skill name",
            );
        }
    });

    test("keeps QoderWork skill frontmatter free of Claude allowed tools", async () => {
        for (const skillName of availableBundledSkillNames) {
            const skillFile = getBundledSkillFiles(skillName, "qoderwork")
                .find(file => file.relativePath === "SKILL.md");

            if (skillFile === undefined) {
                throw new Error(`Missing QoderWork SKILL.md for ${skillName}`);
            }

            expect(await Bun.file(skillFile.sourcePath).text()).not.toContain(
                "allowed-tools",
            );
        }
    });
});

function normalizePathForAssertion(path: string): string {
    return path.replaceAll("\\", "/");
}

function normalizeLineEndingsForAssertion(text: string): string {
    return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}
