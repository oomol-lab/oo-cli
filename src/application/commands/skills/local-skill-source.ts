import type { BundledSkillAgentName } from "./managed-skill-agents.ts";

import {
    availableBundledSkillAgentNames,
    resolveManagedSkillAgentHomeDirectory,
} from "./managed-skill-agents.ts";
import { readSkillsDirectoryEntries } from "./managed-skill-listings.ts";
import {
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillsDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    managedMetadataOfKind,
    readSkillDirectoryState,
} from "./skill-directory-state.ts";

export interface LocalSkillSource {
    agentName: BundledSkillAgentName;
    name: string;
    path: string;
}

export interface LocalSkillSourceContext {
    env: Record<string, string | undefined>;
}

export async function findLocalSkillSources(options: {
    agentName?: BundledSkillAgentName;
    context: LocalSkillSourceContext;
    skillName: string;
}): Promise<LocalSkillSource[]> {
    const sources = await listLocalSkillSources(options.context, {
        agentName: options.agentName,
    });

    return sources.filter(source => source.name === options.skillName);
}

export async function listLocalSkillSources(
    context: LocalSkillSourceContext,
    options: {
        agentName?: BundledSkillAgentName;
    } = {},
): Promise<LocalSkillSource[]> {
    const agentNames = options.agentName === undefined
        ? availableBundledSkillAgentNames
        : [options.agentName];

    const nestedSources = await Promise.all(
        agentNames.map(
            agentName => listAgentLocalSkillSourcesForAgent(context.env, agentName),
        ),
    );

    return nestedSources.flat().sort(compareLocalSkillSources);
}

export async function isLocalSkillDirectory(
    skillDirectoryPath: string,
): Promise<boolean> {
    const state = await readSkillDirectoryState(skillDirectoryPath);

    return managedMetadataOfKind(state, "local") !== undefined;
}

async function listAgentLocalSkillSourcesForAgent(
    env: Record<string, string | undefined>,
    agentName: BundledSkillAgentName,
): Promise<LocalSkillSource[]> {
    const homeDirectory = resolveManagedSkillAgentHomeDirectory(env, agentName);
    const skillsDirectoryPath = resolveManagedSkillsDirectoryPath(homeDirectory);
    const skillNames = await readSkillsDirectoryEntries(skillsDirectoryPath);
    const sources = await Promise.all(
        skillNames.map(async (skillName) => {
            const path = resolveManagedSkillDirectoryPath(homeDirectory, skillName);

            if (!(await isLocalSkillDirectory(path))) {
                return undefined;
            }

            return {
                agentName,
                name: skillName,
                path,
            } satisfies LocalSkillSource;
        }),
    );

    return sources.filter(source => source !== undefined);
}

function compareLocalSkillSources(
    left: LocalSkillSource,
    right: LocalSkillSource,
): number {
    const nameDifference = left.name.localeCompare(right.name);

    if (nameDifference !== 0) {
        return nameDifference;
    }

    return left.agentName.localeCompare(right.agentName);
}
