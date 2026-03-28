import { describe, expect, test } from "bun:test";

import { defaultSettings } from "../../../schemas/settings.ts";
import {
    getSkillConfigDefinition,
    getSkillConfigKeyChoices,
    listSkillConfigValues,
    skillConfigSkillChoices,
} from "./shared.ts";

describe("skills config shared contracts", () => {
    test("keeps the bundled skill config registry aligned with the public contract", () => {
        expect(skillConfigSkillChoices).toEqual(["oo"]);
        expect(getSkillConfigKeyChoices("oo")).toEqual([
            "allow-implicit-invocation",
        ]);
        expect(listSkillConfigValues(defaultSettings, "oo")).toEqual([
            "allow-implicit-invocation=true",
        ]);
    });

    test("keeps the oo skill config value contract aligned with the public contract", () => {
        const definition = getSkillConfigDefinition(
            "oo",
            "allow-implicit-invocation",
        );

        expect(definition.valueChoices).toEqual(["true", "false"]);
    });
});
