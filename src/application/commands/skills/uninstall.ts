import type { CliCommandDefinition } from "../../contracts/cli.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";

import { z } from "zod";
import { parseEnumOption } from "../shared/input-parsing.ts";
import { availableBundledSkillAgentNames } from "./embedded-assets.ts";
import { uninstallRequestedSkill } from "./managed-skill-uninstall.ts";

interface SkillsUninstallInput {
    agent?: string;
    skill?: string;
}

export const skillsUninstallCommand: CliCommandDefinition<SkillsUninstallInput> = {
    name: "uninstall",
    aliases: ["remove"],
    summaryKey: "commands.skills.uninstall.summary",
    descriptionKey: "commands.skills.uninstall.description",
    arguments: [
        {
            name: "skill",
            descriptionKey: "arguments.skill",
            required: false,
        },
    ],
    options: [
        {
            name: "agent",
            longFlag: "--agent",
            valueName: "agent",
            descriptionKey: "options.agent",
        },
    ],
    inputSchema: z.object({
        agent: z.string().optional(),
        skill: z.string().optional(),
    }),
    handler: async (input, context) => {
        await uninstallRequestedSkill(input.skill, context, {
            agentName: parseSkillsUninstallAgent(input.agent),
        });
    },
};

function parseSkillsUninstallAgent(
    value: string | undefined,
): BundledSkillAgentName | undefined {
    if (value === undefined) {
        return undefined;
    }

    return parseEnumOption(
        value,
        availableBundledSkillAgentNames,
        "errors.skills.uninstall.invalidAgent",
    );
}
