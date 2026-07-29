import { describe, expect, test } from "bun:test";

import {
    createSkillAutoTriggerRenderVariables,
    defaultSkillAutoTriggerPolicy,
    isSkillAutoTriggerEnabled,
    readSkillAutoTriggerReason,
    resolveSkillAutoTriggerPolicy,
} from "./auto-trigger-policy.ts";
import {
    availableBundledSkillAgentNames,
    availableBundledSkillNames,
    getBundledSkillFiles,
    readBundledSkillFileContent,
} from "./embedded-assets.ts";

describe("skill auto-trigger policy", () => {
    test("leaves every bundled skill auto-triggering by default", () => {
        for (const skillName of availableBundledSkillNames) {
            expect(
                isSkillAutoTriggerEnabled(defaultSkillAutoTriggerPolicy, skillName),
            ).toBeTrue();
            expect(
                readSkillAutoTriggerReason(defaultSkillAutoTriggerPolicy, skillName),
            ).toBe("default");
        }
    });

    test("reads the standing policy as covering every skill, named or not", () => {
        const policy = { disabled: [], disabledAll: true };

        for (const skillName of availableBundledSkillNames) {
            expect(isSkillAutoTriggerEnabled(policy, skillName)).toBeFalse();
            expect(readSkillAutoTriggerReason(policy, skillName)).toBe("all");
        }
    });

    test("reads a named skill as disabled and leaves the rest alone", () => {
        const policy = { disabled: ["oo-create-skill"], disabledAll: false };

        expect(isSkillAutoTriggerEnabled(policy, "oo-create-skill")).toBeFalse();
        expect(readSkillAutoTriggerReason(policy, "oo-create-skill")).toBe("skill");
        expect(isSkillAutoTriggerEnabled(policy, "oo")).toBeTrue();
        expect(readSkillAutoTriggerReason(policy, "oo")).toBe("default");
    });

    test("lets the standing policy outrank a per-skill entry", () => {
        const policy = { disabled: ["oo-create-skill"], disabledAll: true };

        expect(readSkillAutoTriggerReason(policy, "oo")).toBe("all");
        expect(readSkillAutoTriggerReason(policy, "oo-create-skill")).toBe("all");
    });

    test("resolves the policy from settings", () => {
        expect(resolveSkillAutoTriggerPolicy({})).toEqual(defaultSkillAutoTriggerPolicy);
        expect(
            resolveSkillAutoTriggerPolicy({
                skills: { auto_trigger: { disabled: ["oo"], disabled_all: true } },
            }),
        ).toEqual({ disabled: ["oo"], disabledAll: true });
    });

    test("keeps the two vendor markers inverse to each other", () => {
        expect(createSkillAutoTriggerRenderVariables(true)).toEqual({
            allowImplicitInvocation: "true",
            disableModelInvocation: "false",
        });
        expect(createSkillAutoTriggerRenderVariables(false)).toEqual({
            allowImplicitInvocation: "false",
            disableModelInvocation: "true",
        });
    });
});

describe("bundled skill auto-trigger markers", () => {
    // Every bundled skill needs both markers wired to the render variables. A
    // template that hardcodes a value, or omits the frontmatter field, would
    // silently ignore the policy for that one skill, so all four are asserted.
    test("renders both markers for every bundled skill and agent when auto-trigger is on", async () => {
        for (const skillName of availableBundledSkillNames) {
            for (const agentName of availableBundledSkillAgentNames) {
                expect(
                    await readMarkerContent(skillName, agentName, "SKILL.md"),
                ).toContain("disable-model-invocation: false");
                expect(
                    await readMarkerContent(skillName, agentName, "agents/openai.yaml"),
                ).toContain("allow_implicit_invocation: true");
            }
        }
    });

    test("flips both markers for every bundled skill and agent when the standing policy is off", async () => {
        const policy = { disabled: [], disabledAll: true };

        for (const skillName of availableBundledSkillNames) {
            for (const agentName of availableBundledSkillAgentNames) {
                expect(
                    await readMarkerContent(skillName, agentName, "SKILL.md", policy),
                ).toContain("disable-model-invocation: true");
                expect(
                    await readMarkerContent(
                        skillName,
                        agentName,
                        "agents/openai.yaml",
                        policy,
                    ),
                ).toContain("allow_implicit_invocation: false");
            }
        }
    });

    test("flips the markers only for the named skill", async () => {
        const policy = { disabled: ["oo-create-skill"], disabledAll: false };

        expect(
            await readMarkerContent("oo-create-skill", "claude", "SKILL.md", policy),
        ).toContain("disable-model-invocation: true");
        expect(
            await readMarkerContent("oo-create-skill", "claude", "agents/openai.yaml", policy),
        ).toContain("allow_implicit_invocation: false");
        expect(
            await readMarkerContent("oo", "claude", "SKILL.md", policy),
        ).toContain("disable-model-invocation: false");
        expect(
            await readMarkerContent("oo", "claude", "agents/openai.yaml", policy),
        ).toContain("allow_implicit_invocation: true");
    });
});

async function readMarkerContent(
    skillName: (typeof availableBundledSkillNames)[number],
    agentName: (typeof availableBundledSkillAgentNames)[number],
    relativePath: string,
    policy?: { disabled: readonly string[]; disabledAll: boolean },
): Promise<string> {
    const file = getBundledSkillFiles(skillName, agentName).find(
        candidate => candidate.relativePath === relativePath,
    );

    if (file === undefined) {
        throw new Error(`Missing bundled skill file ${relativePath} for ${skillName}.`);
    }

    return await readBundledSkillFileContent(file, policy);
}
