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
            "oo-publish-skill",
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
        expect(getBundledSkillFiles("oo", "hermes").map(file => file.relativePath)).toEqual([
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
        expect(getBundledSkillFiles("oo", "workbuddy").map(file => file.relativePath)).toEqual([
            "SKILL.md",
            "references/auth-and-billing.md",
            "references/search-and-selection.md",
            "references/package-execution.md",
            "references/connector-execution.md",
            "references/file-transfer.md",
            "references/task-lifecycle.md",
        ]);
        expect(getBundledSkillFiles("oo", "trae").map(file => file.relativePath)).toEqual([
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
            getBundledSkillFiles("oo-find-skills", "hermes").map(
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
            getBundledSkillFiles("oo-find-skills", "workbuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "references/oo-cli-contract.md",
        ]);
        expect(
            getBundledSkillFiles("oo-find-skills", "trae").map(
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
            getBundledSkillFiles("oo-create-skill", "hermes").map(
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
            getBundledSkillFiles("oo-create-skill", "workbuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-create-skill", "trae").map(
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
        expect(
            getBundledSkillFiles("oo-publish-skill", "codex").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
            "agents/openai.yaml",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "claude").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "hermes").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "codebuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "workbuddy").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "trae").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "openclaw").map(
                file => file.relativePath,
            ),
        ).toEqual([
            "SKILL.md",
        ]);
        expect(
            getBundledSkillFiles("oo-publish-skill", "qoderwork").map(
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
            "hermes",
            "codebuddy",
            "workbuddy",
            "trae",
            "openclaw",
            "qoderwork",
        ]);

        for (const skillName of availableBundledSkillNames) {
            for (const agentName of availableBundledSkillAgentNames) {
                const sourceAgentName = readBundledSkillSourceAgentName(agentName);
                const sourceDirectory = `contrib/skills/${sourceAgentName}/${skillName}`;
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

    test("guides oo-create-skill trigger descriptions toward local skill authoring", async () => {
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

            expect(content).toContain("Author, generate, scaffold, or update");
            expect(content).toContain("create a skill, write a skill, make a");
            expect(content).toContain("Codex/Claude/agent skill");
            expect(content).toContain("connector action");
            expect(content).toContain("capability discovery is needed first");
            expect(content).toContain("discover or install existing published skills");
            expect(content).toContain("publish a finished skill");
            expect(content).not.toContain("already knows which oo package or block");
        }

        const openAiAgentFile = getBundledSkillFiles("oo-create-skill", "codex").find(
            file => file.relativePath === "agents/openai.yaml",
        );

        if (openAiAgentFile === undefined) {
            throw new Error("Missing codex oo-create-skill agents/openai.yaml");
        }

        const openAiAgentContent = await Bun.file(openAiAgentFile.sourcePath).text();

        expect(openAiAgentContent).toContain("$oo-create-skill");
        expect(openAiAgentContent).toContain("author, scaffold, generate, or update");
        expect(openAiAgentContent).toContain("connector action");
        expect(openAiAgentContent).toContain("capability discovery is needed before authoring");
        expect(openAiAgentContent).toContain(
            "finding/installing published skills or publishing finished skills",
        );
    });

    test("guides oo-create-skill generated descriptions toward user outcomes", async () => {
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

            expect(content).toContain("business-trigger-oriented");
            expect(content).toContain("Center the user-visible task");
            expect(content).toContain("Include a model or product\nname only");
            expect(content).toContain("Keep implementation plumbing out of the description");
            expect(content).toContain("connector service/action identifiers");
            expect(content).toContain("provider\nchannel names");
            expect(content).toContain(
                "Put concrete execution references in the workflow body instead.",
            );
            expect(content).toContain(
                "It must not read like an implementation recipe or capability inventory.",
            );
            expect(content).toContain("avoid channel-first descriptions");
        }
    });

    test("guides oo-create-skill discovery toward connector-aware selection", async () => {
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

            expect(content).toContain(
                "Resolve concrete package, block, and connector references",
            );
            expect(content).toContain(
                "Treat package and connector results as first-class authoring candidates.",
            );
            expect(content).toContain("prefer an already-authenticated connector");
            expect(content).toContain("Do not force a package or block reference");
            expect(content).toContain("when the chosen reusable workflow is connector-backed.");
            expect(content).toContain(
                "concrete connector service/action identifiers",
            );
            expect(content).toContain("run `oo search`, `oo connector search`");
            expect(content).toContain("discover capabilities at execution time");
        }
    });

    test("guides oo-publish-skill agents to publish agent skills", async () => {
        for (const agentName of availableBundledSkillAgentNames) {
            const skillFile = getBundledSkillFiles("oo-publish-skill", agentName).find(
                file => file.relativePath === "SKILL.md",
            );

            if (skillFile === undefined) {
                throw new Error(`Missing ${agentName} oo-publish-skill SKILL.md`);
            }

            const content = normalizeLineEndingsForAssertion(
                await Bun.file(skillFile.sourcePath).text(),
            );

            expect(content).toContain(
                "Publish, release, upload, submit, or share",
            );
            expect(content).toContain("existing AI agent skill");
            expect(content).toContain("it does not need to be an oo-specific skill");
            expect(content).toContain("oo skills publish");
            expect(content).toContain("When publishing by skill id");
            expect(content).toContain("include `--agent");
            expect(content).toContain("Add `--visibility public` only");
            expect(content).toContain("The publish command performs its own");
            expect(content).toContain("Do not ask whether to publish to the current account");
            expect(content).toContain("Do not package manually");
            expect(content).toContain("Report the published package name");
            expect(content).not.toContain("OOMOL/oo skill");
            expect(content).not.toContain("oo skills preflight");
            expect(content).not.toContain("oo auth status");
            expect(content).not.toContain("Use `--agent` only as a source hint");
        }
    });

    test("keeps non-Claude skill frontmatter free of Claude allowed tools", async () => {
        for (const agentName of ["qoderwork", "trae", "workbuddy"] as const) {
            for (const skillName of availableBundledSkillNames) {
                const skillFile = getBundledSkillFiles(skillName, agentName)
                    .find(file => file.relativePath === "SKILL.md");

                if (skillFile === undefined) {
                    throw new Error(`Missing ${agentName} SKILL.md for ${skillName}`);
                }

                expect(await Bun.file(skillFile.sourcePath).text()).not.toContain(
                    "allowed-tools",
                );
            }
        }
    });
});

function normalizePathForAssertion(path: string): string {
    return path.replaceAll("\\", "/");
}

function normalizeLineEndingsForAssertion(text: string): string {
    return text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function readBundledSkillSourceAgentName(
    agentName: (typeof availableBundledSkillAgentNames)[number],
): string {
    switch (agentName) {
        case "hermes":
            return "claude";
        case "trae":
        case "workbuddy":
            return "codebuddy";
        default:
            return agentName;
    }
}
