import { describe, expect, test } from "bun:test";
import { parse as parseToml } from "smol-toml";

import {
    addAutoTriggerDisabledSkills,
    addDismissedSkillRecommendations,
    getAutoTriggerDisabledSkills,
    getDismissedSkillRecommendations,
    getLegacyIdentityTeam,
    getOpenFlowServerProject,
    isSkillAutoTriggerDisabledForAll,
    isSkillRecommendationsMuted,
    removeAutoTriggerDisabledSkills,
    removeDismissedSkillRecommendations,
    renderSettingsFile,
    setOpenFlowServerProject,
    setSkillAutoTriggerDisabledForAll,
    setSkillRecommendationsMuted,
    settingsFileReadSchema,
    unsetLegacyIdentityTeam,
} from "./settings.ts";

describe("Open Flow Server Project settings", () => {
    test("persists one selected Project per Server origin", () => {
        const first = setOpenFlowServerProject(
            {},
            "https://flow-b.example.test",
            "project-b",
        );
        const settings = setOpenFlowServerProject(
            first,
            "https://flow-a.example.test",
            "project-a",
        );
        const replaced = setOpenFlowServerProject(
            settings,
            "https://flow-b.example.test",
            "project-b-next",
        );
        const parsed = settingsFileReadSchema.parse(
            parseToml(renderSettingsFile(replaced)),
        );

        expect(getOpenFlowServerProject(parsed, "https://flow-a.example.test")).toBe(
            "project-a",
        );
        expect(getOpenFlowServerProject(parsed, "https://flow-b.example.test")).toBe(
            "project-b-next",
        );
        expect(parsed.open_flow?.server_projects?.map(project => project.origin)).toEqual([
            "https://flow-a.example.test",
            "https://flow-b.example.test",
        ]);
    });
});

describe("skill auto-trigger settings", () => {
    test("defaults to auto-trigger enabled with no per-skill entries", () => {
        expect(isSkillAutoTriggerDisabledForAll({})).toBe(false);
        expect(getAutoTriggerDisabledSkills({})).toEqual([]);
    });

    test("clears the per-skill list when the standing policy is set", () => {
        const named = addAutoTriggerDisabledSkills({}, ["oo-create-skill"]);
        const all = setSkillAutoTriggerDisabledForAll(named, true);

        expect(isSkillAutoTriggerDisabledForAll(all)).toBe(true);
        expect(getAutoTriggerDisabledSkills(all)).toEqual([]);
    });

    test("clears the whole section when the standing policy is lifted", () => {
        const all = setSkillAutoTriggerDisabledForAll(
            addAutoTriggerDisabledSkills({}, ["oo-create-skill"]),
            true,
        );
        const cleared = setSkillAutoTriggerDisabledForAll(all, false);

        expect(isSkillAutoTriggerDisabledForAll(cleared)).toBe(false);
        expect(getAutoTriggerDisabledSkills(cleared)).toEqual([]);
        expect(cleared.skills?.auto_trigger).toBeUndefined();
    });

    test("sorts and de-duplicates per-skill entries", () => {
        const settings = addAutoTriggerDisabledSkills({}, [
            "oo-publish-skill",
            "oo-create-skill",
            "oo-publish-skill",
        ]);

        expect(getAutoTriggerDisabledSkills(settings)).toEqual([
            "oo-create-skill",
            "oo-publish-skill",
        ]);
    });

    test("prunes the per-skill list once the last entry is removed", () => {
        const settings = addAutoTriggerDisabledSkills({}, ["oo-create-skill"]);
        const cleared = removeAutoTriggerDisabledSkills(settings, ["oo-create-skill"]);

        expect(getAutoTriggerDisabledSkills(cleared)).toEqual([]);
        expect(cleared.skills?.auto_trigger?.disabled).toBeUndefined();
    });

    test("keeps a standing policy while a per-skill entry is added", () => {
        const settings = addAutoTriggerDisabledSkills(
            setSkillAutoTriggerDisabledForAll({}, true),
            ["oo-create-skill"],
        );

        expect(isSkillAutoTriggerDisabledForAll(settings)).toBe(true);
        expect(getAutoTriggerDisabledSkills(settings)).toEqual(["oo-create-skill"]);
    });

    // `[skills]` is shared with `[skills.recommend]`, and lifting the standing
    // policy is the one mutation here that deletes a whole subsection. If the
    // empty-parent pruning ever over-reaches it would wipe an unrelated mute
    // and dismissal list from a command that never mentions recommendations.
    test("leaves skills.recommend intact when the standing policy is lifted", () => {
        const settings = setSkillAutoTriggerDisabledForAll(
            addDismissedSkillRecommendations(
                setSkillRecommendationsMuted({}, true),
                ["oo-gmail"],
            ),
            true,
        );
        const cleared = setSkillAutoTriggerDisabledForAll(settings, false);

        expect(cleared.skills?.auto_trigger).toBeUndefined();
        expect(isSkillRecommendationsMuted(cleared)).toBe(true);
        expect(getDismissedSkillRecommendations(cleared)).toEqual(["oo-gmail"]);

        const rendered = renderSettingsFile(cleared);

        expect(rendered).toContain("\n[skills.recommend]");
        expect(rendered).not.toContain("\n[skills.auto_trigger]");
    });

    test("renders and round-trips the skills.auto_trigger section", () => {
        const settings = addAutoTriggerDisabledSkills(
            setSkillAutoTriggerDisabledForAll({}, true),
            ["oo-create-skill"],
        );
        const rendered = renderSettingsFile(settings);

        expect(rendered).toContain("[skills.auto_trigger]");

        const parsed = settingsFileReadSchema.parse(parseToml(rendered));

        expect(parsed.skills?.auto_trigger?.disabled_all).toBe(true);
        expect(parsed.skills?.auto_trigger?.disabled).toEqual(["oo-create-skill"]);
    });

    test("does not render an active skills.auto_trigger section by default", () => {
        const rendered = renderSettingsFile({});

        expect(rendered).not.toContain("\n[skills.auto_trigger]");
        expect(rendered).not.toContain("\n[skills]");
    });

    test("keeps both skills subsections when each holds a value", () => {
        const settings = addAutoTriggerDisabledSkills(
            setSkillRecommendationsMuted({}, true),
            ["oo-create-skill"],
        );
        const parsed = settingsFileReadSchema.parse(
            parseToml(renderSettingsFile(settings)),
        );

        expect(parsed.skills?.recommend?.muted).toBe(true);
        expect(parsed.skills?.auto_trigger?.disabled).toEqual(["oo-create-skill"]);
    });
});

describe("skill recommendation settings", () => {
    test("defaults to not muted with no dismissals", () => {
        expect(isSkillRecommendationsMuted({})).toBe(false);
        expect(getDismissedSkillRecommendations({})).toEqual([]);
    });

    test("setting muted to true then false clears the key", () => {
        const muted = setSkillRecommendationsMuted({}, true);

        expect(isSkillRecommendationsMuted(muted)).toBe(true);

        const cleared = setSkillRecommendationsMuted(muted, false);

        expect(isSkillRecommendationsMuted(cleared)).toBe(false);
        expect(cleared.skills?.recommend?.muted).toBeUndefined();
    });

    test("dismissals are de-duplicated and sorted", () => {
        const settings = addDismissedSkillRecommendations({}, ["oo-notion", "oo-gmail", "oo-notion"]);

        expect(getDismissedSkillRecommendations(settings)).toEqual(["oo-gmail", "oo-notion"]);
    });

    test("removing the last dismissal prunes the list", () => {
        const settings = addDismissedSkillRecommendations({}, ["oo-gmail"]);
        const cleared = removeDismissedSkillRecommendations(settings, ["oo-gmail"]);

        expect(getDismissedSkillRecommendations(cleared)).toEqual([]);
        expect(cleared.skills?.recommend?.dismissed).toBeUndefined();
    });

    test("adding dismissals preserves an existing global mute", () => {
        const muted = setSkillRecommendationsMuted({}, true);
        const settings = addDismissedSkillRecommendations(muted, ["oo-gmail"]);

        expect(isSkillRecommendationsMuted(settings)).toBe(true);
        expect(getDismissedSkillRecommendations(settings)).toEqual(["oo-gmail"]);
    });

    test("renders and round-trips the skills.recommend section", () => {
        const settings = addDismissedSkillRecommendations(
            setSkillRecommendationsMuted({}, true),
            ["oo-gmail"],
        );
        const rendered = renderSettingsFile(settings);

        expect(rendered).toContain("[skills.recommend]");
        expect(rendered).toContain("muted = true");
        expect(rendered).toContain("dismissed = [\"oo-gmail\"]");

        const parsed = settingsFileReadSchema.parse(parseToml(rendered));

        expect(parsed.skills?.recommend?.muted).toBe(true);
        expect(parsed.skills?.recommend?.dismissed).toEqual(["oo-gmail"]);
    });

    test("does not render an active skills.recommend section by default", () => {
        // The default file only carries the commented documentation block, so
        // parsing it back yields no active skills settings.
        const parsed = settingsFileReadSchema.parse(parseToml(renderSettingsFile({})));

        expect(parsed.skills).toBeUndefined();
    });

    test("never persists the default muted=false value", () => {
        const rendered = renderSettingsFile({ skills: { recommend: { muted: false } } });
        const parsed = settingsFileReadSchema.parse(parseToml(rendered));

        expect(parsed.skills).toBeUndefined();
    });
});

describe("legacy identity.team setting", () => {
    test("leaves no trace in a fresh settings file", () => {
        expect(renderSettingsFile({})).not.toContain("identity");
    });

    test("preserves a legacy value across an unrelated settings write", () => {
        const rendered = renderSettingsFile({
            identity: { team: "acme" },
            lang: "zh",
        });
        const parsed = settingsFileReadSchema.parse(parseToml(rendered));

        expect(getLegacyIdentityTeam(parsed)).toBe("acme");
    });

    test("unsetting prunes the whole identity section", () => {
        const settings = unsetLegacyIdentityTeam({ identity: { team: "acme" } });

        expect(getLegacyIdentityTeam(settings)).toBeUndefined();
        expect(renderSettingsFile(settings)).not.toContain("identity");
    });

    test("unsetting an absent value returns the same settings", () => {
        const settings = { lang: "en" } as const;

        expect(unsetLegacyIdentityTeam(settings)).toBe(settings);
    });
});
