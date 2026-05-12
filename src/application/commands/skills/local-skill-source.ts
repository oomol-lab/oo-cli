import type { BundledSkillAgentName } from "./embedded-assets.ts";

import { readdir } from "node:fs/promises";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
import {
    resolveBundledSkillHomeDirectory,
} from "./bundled-skill-paths.ts";
import {
    availableBundledSkillAgentNames,
} from "./embedded-assets.ts";
import { readSkillMetadataFileState } from "./local-skill-ownership.ts";
import {
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillsDirectoryPath,
} from "./managed-skill-paths.ts";

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

export async function findLocalSkillSource(options: {
    agentName?: BundledSkillAgentName;
    context: LocalSkillSourceContext;
    skillName: string;
}): Promise<LocalSkillSource | undefined> {
    const sources = await findLocalSkillSources(options);

    if (sources.length === 1) {
        return sources[0];
    }

    return undefined;
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
    const metadataState = await readSkillMetadataFileState(skillDirectoryPath);

    return metadataState.metadata?.kind === "local";
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
    const homeDirectory = resolveBundledSkillHomeDirectory(env, agentName);

    if (!(await directoryExists(homeDirectory))) {
        return [];
    }

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
