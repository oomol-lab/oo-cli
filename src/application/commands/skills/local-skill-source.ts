import type { BundledSkillAgentName } from "./managed-skill-agents.ts";

import { readdir } from "node:fs/promises";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import {
    availableBundledSkillAgentNames,
    resolveManagedSkillAgentHomeDirectory,
} from "./managed-skill-agents.ts";
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
    kind: "agent";
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

    return (await listAgentLocalSkillSources(context.env, agentNames))
        .sort(compareLocalSkillSources);
}

export async function isLocalSkillDirectory(
    skillDirectoryPath: string,
): Promise<boolean> {
    const state = await readSkillDirectoryState(skillDirectoryPath);

    return managedMetadataOfKind(state, "local") !== undefined;
}

async function listAgentLocalSkillSources(
    env: Record<string, string | undefined>,
    agentNames: readonly BundledSkillAgentName[],
): Promise<LocalSkillSource[]> {
    const nestedSources = await Promise.all(
        agentNames.map(agentName => listAgentLocalSkillSourcesForAgent(env, agentName)),
    );

    return nestedSources.flat();
}

async function listAgentLocalSkillSourcesForAgent(
    env: Record<string, string | undefined>,
    agentName: BundledSkillAgentName,
): Promise<LocalSkillSource[]> {
    const homeDirectory = resolveManagedSkillAgentHomeDirectory(env, agentName);
    const skillsDirectoryPath = resolveManagedSkillsDirectoryPath(homeDirectory);
    const skillNames = await readSkillDirectoryNames(skillsDirectoryPath);
    const sources = await Promise.all(
        skillNames.map(async (skillName) => {
            const path = resolveManagedSkillDirectoryPath(homeDirectory, skillName);

            if (!(await isLocalSkillDirectory(path))) {
                return undefined;
            }

            return {
                agentName,
                kind: "agent",
                name: skillName,
                path,
            } satisfies LocalSkillSource;
        }),
    );

    return sources.filter(source => source !== undefined);
}

async function readSkillDirectoryNames(skillsDirectoryPath: string): Promise<string[]> {
    try {
        const entries = await readdir(skillsDirectoryPath, { withFileTypes: true });

        return entries
            .filter(entry => entry.isDirectory() || entry.isSymbolicLink())
            .map(entry => entry.name);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return [];
        }

        throw error;
    }
}

function compareLocalSkillSources(
    left: LocalSkillSource,
    right: LocalSkillSource,
): number {
    const nameDifference = left.name.localeCompare(right.name);

    if (nameDifference !== 0) {
        return nameDifference;
    }

    return resolveLocalSkillSourceSortKey(left)
        .localeCompare(resolveLocalSkillSourceSortKey(right));
}

function resolveLocalSkillSourceSortKey(source: LocalSkillSource): string {
    return source.agentName;
}
