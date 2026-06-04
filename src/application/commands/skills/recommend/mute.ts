import {
    addDismissedSkillRecommendations,
    setSkillRecommendationsMuted,
} from "../../../schemas/settings.ts";
import { createSuppressionCommand } from "./suppression-command.ts";

export const skillsRecommendMuteCommand = createSuppressionCommand({
    name: "mute",
    applyAll: settings => setSkillRecommendationsMuted(settings, true),
    applyPackages: (settings, packageNames) =>
        addDismissedSkillRecommendations(settings, packageNames),
});
