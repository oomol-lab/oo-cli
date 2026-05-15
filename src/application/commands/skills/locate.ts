import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";

import { join } from "node:path";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { writeLine } from "../shared/output.ts";
import { fileExists } from "./bundled-skill-observation.ts";
import { resolveBundledSkillHomeDirectory } from "./bundled-skill-paths.ts";
import { parseManagedSkillAgentOption } from "./managed-skill-agents.ts";
import {
    resolveAvailableManagedSkillHosts,
} from "./managed-skill-hosts.ts";
import {
    resolveManagedSkillCanonicalDirectoryPath,
    resolveManagedSkillDirectoryPath,
} from "./managed-skill-paths.ts";
import { isSkillIdReference } from "./skill-id.ts";

interface SkillsLocateInput {
    agent?: string;
    skill: string;
}

interface SkillLocation {
    label: string;
    path: string;
}

export const skillsLocateCommand: CliCommandDefinition<SkillsLocateInput> = {
    name: "locate",
    summaryKey: "commands.skills.locate.summary",
    descriptionKey: "commands.skills.locate.description",
    arguments: [
        {
            name: "skill",
            descriptionKey: "arguments.skill",
            required: true,
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
        skill: z.string(),
    }),
    handler: async (input, context) => {
        const agentName = parseSkillLocateAgent(input.agent);

        context.telemetry?.recordProperties({
            has_agent_filter: agentName !== undefined,
        });

        writeLine(
            context.stdout,
            await locateSkillPath(input.skill, context, { agentName }),
        );
    },
};

export async function locateSkillPath(
    skillName: string,
    context: Pick<CliExecutionContext, "env" | "settingsStore">,
    options: {
        agentName?: BundledSkillAgentName;
    } = {},
): Promise<string> {
    const trimmedSkillName = skillName.trim();

    if (!isSkillIdReference(trimmedSkillName)) {
        throw new CliUserError("errors.skills.locate.invalidSkillId", 1, {
            name: skillName,
        });
    }

    const locations = options.agentName === undefined
        ? await findAllSkillLocations(trimmedSkillName, context)
        : await findAgentSkillLocations(trimmedSkillName, context.env, [
                options.agentName,
            ]);

    if (locations.length === 1) {
        return locations[0]!.path;
    }

    if (locations.length === 0) {
        throw new CliUserError("errors.skills.locate.notFound", 1, {
            name: skillName,
        });
    }

    throw new CliUserError("errors.skills.locate.ambiguous", 1, {
        name: skillName,
        paths: formatSkillLocationCandidates(locations),
    });
}

function parseSkillLocateAgent(
    value: string | undefined,
): BundledSkillAgentName | undefined {
    return parseManagedSkillAgentOption(value, "errors.skills.locate.invalidAgent");
}

async function findAllSkillLocations(
    skillName: string,
    context: Pick<CliExecutionContext, "env" | "settingsStore">,
): Promise<SkillLocation[]> {
    const hosts = await resolveAvailableManagedSkillHosts(context.env);
    const agentLocations = await findAgentSkillLocations(
        skillName,
        context.env,
        hosts.map(host => host.agentName),
    );
    const canonicalLocation = await findCanonicalRegistrySkillLocation(
        skillName,
        context.settingsStore.getFilePath(),
    );

    return canonicalLocation === undefined
        ? agentLocations
        : [...agentLocations, canonicalLocation];
}

async function findAgentSkillLocations(
    skillName: string,
    env: Record<string, string | undefined>,
    agentNames: readonly BundledSkillAgentName[],
): Promise<SkillLocation[]> {
    const locations = await Promise.all(
        agentNames.map(async (agentName) => {
            const skillDirectoryPath = resolveManagedSkillDirectoryPath(
                resolveBundledSkillHomeDirectory(env, agentName),
                skillName,
            );

            if (!(await hasSkillFile(skillDirectoryPath))) {
                return undefined;
            }

            return {
                label: agentName,
                path: skillDirectoryPath,
            } satisfies SkillLocation;
        }),
    );

    return locations.filter(location => location !== undefined);
}

async function findCanonicalRegistrySkillLocation(
    skillName: string,
    settingsFilePath: string,
): Promise<SkillLocation | undefined> {
    const skillDirectoryPath = resolveManagedSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillName,
    );

    if (!(await hasSkillFile(skillDirectoryPath))) {
        return undefined;
    }

    return {
        label: "registry",
        path: skillDirectoryPath,
    };
}

async function hasSkillFile(skillDirectoryPath: string): Promise<boolean> {
    return await fileExists(join(skillDirectoryPath, "SKILL.md"));
}

function formatSkillLocationCandidates(
    locations: readonly SkillLocation[],
): string {
    return locations
        .map(location => `- ${location.label}: ${location.path}`)
        .join("\n");
}
