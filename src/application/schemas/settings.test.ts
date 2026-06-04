import { describe, expect, test } from "bun:test";
import { parse as parseToml } from "smol-toml";

import {
    addDismissedSkillRecommendations,
    getDismissedSkillRecommendations,
    isSkillRecommendationsMuted,
    removeDismissedSkillRecommendations,
    renderSettingsFile,
    setSkillRecommendationsMuted,
    settingsFileReadSchema,
} from "./settings.ts";

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
