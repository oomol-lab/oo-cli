import { describe, expect, test } from "bun:test";

import { defaultSettings } from "../../../schemas/settings.ts";
import { availableBundledSkillNames } from "../embedded-assets.ts";
import {
    getSkillConfigDefinition,
    getSkillConfigDefinitionByRawInput,
    getSkillConfigKeyChoices,
    listSkillConfigValues,
    skillConfigSkillChoices,
} from "./shared.ts";

describe("skills config shared contracts", () => {
    test("keeps the bundled skill registry aligned with the config registry", () => {
        expect(availableBundledSkillNames).toEqual(["oo", "oo-find-skills"]);
        expect(skillConfigSkillChoices).toEqual(["oo", "oo-find-skills"]);
    });

    test("keeps the bundled skill config registry aligned with the public contract", () => {
        expect(skillConfigSkillChoices).toEqual(["oo", "oo-find-skills"]);
        expect(getSkillConfigKeyChoices("oo")).toEqual([
            "allow-implicit-invocation",
        ]);
        expect(getSkillConfigKeyChoices("oo-find-skills")).toEqual([
            "allow-implicit-invocation",
        ]);
        expect(listSkillConfigValues(defaultSettings, "oo")).toEqual([
            "allow-implicit-invocation=true",
        ]);
        expect(listSkillConfigValues(defaultSettings, "oo-find-skills")).toEqual([
            "allow-implicit-invocation=true",
        ]);
    });

    test("keeps bundled skill config value contracts aligned with the public contract", () => {
        for (const skillName of skillConfigSkillChoices) {
            const definition = getSkillConfigDefinition(
                skillName,
                "allow-implicit-invocation",
            );

            expect(definition.valueChoices).toEqual(["true", "false"]);
        }
    });

    test("keeps skill config lookup helpers aligned with key choices", () => {
        for (const skillName of skillConfigSkillChoices) {
            const [key] = getSkillConfigKeyChoices(skillName);

            expect(key).toBe("allow-implicit-invocation");
            expect(getSkillConfigDefinitionByRawInput(skillName, key)).toBe(
                getSkillConfigDefinition(skillName, key!),
            );
            expect(getSkillConfigDefinitionByRawInput(skillName, "missing")).toBeUndefined();
        }
    });
});
