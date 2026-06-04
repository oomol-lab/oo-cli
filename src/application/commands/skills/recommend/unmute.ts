import {
    removeDismissedSkillRecommendations,
    setSkillRecommendationsMuted,
} from "../../../schemas/settings.ts";
import { createSuppressionCommand } from "./suppression-command.ts";

export const skillsRecommendUnmuteCommand = createSuppressionCommand({
    name: "unmute",
    applyAll: settings => setSkillRecommendationsMuted(settings, false),
    applyPackages: (settings, packageNames) =>
        removeDismissedSkillRecommendations(settings, packageNames),
});
