import type { CliCommandDefinition } from "../../../contracts/cli.ts";

import { skillsRecommendMuteCommand } from "./mute.ts";
import { skillsRecommendPlanCommand } from "./plan.ts";
import { skillsRecommendUnmuteCommand } from "./unmute.ts";

export const skillsRecommendCommand: CliCommandDefinition = {
    name: "recommend",
    summaryKey: "commands.skills.recommend.summary",
    descriptionKey: "commands.skills.recommend.description",
    children: [
        skillsRecommendPlanCommand,
        skillsRecommendMuteCommand,
        skillsRecommendUnmuteCommand,
    ],
};
