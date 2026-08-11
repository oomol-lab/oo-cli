import type { BundledSkillAgentName } from "./managed-skill-agents.ts";

import { realpath } from "node:fs/promises";
import { CliUserError } from "../../contracts/cli.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
import {
    availableBundledSkillAgentNames,
    readManagedSkillAgent,
    resolveManagedSkillAgentHomeDirectory,
} from "./managed-skill-agents.ts";
import {
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillsDirectoryPath,
} from "./managed-skill-paths.ts";

export interface ManagedSkillHost {
    agentName: BundledSkillAgentName;
    homeDirectory: string;
}

export interface ManagedSkillHostInstallation extends ManagedSkillHost {
    installedSkillDirectoryPath: string;
}

export async function resolveAvailableManagedSkillHosts(
    env: Record<string, string | undefined>,
): Promise<ManagedSkillHost[]> {
    const hosts = await Promise.all(
        availableBundledSkillAgentNames.map(async (agentName) => {
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(env, agentName);

            // Always-provision hosts (the universal `~/.agents` host) are treated
            // as available even when their home directory does not exist yet; the
            // directory is created when skills are materialized. Every other host
            // is only available once its home directory is present on disk.
            if (
                !readManagedSkillAgent(agentName).alwaysProvision
                && !(await directoryExists(homeDirectory))
            ) {
                return undefined;
            }

            return {
                agentName,
                homeDirectory,
            } satisfies ManagedSkillHost;
        }),
    );

    return collapseAliasedManagedSkillHosts(
        hosts.filter(host => host !== undefined),
    );
}

// Several supported agents can share one physical skills directory: a
// symlinked `~/.claude/skills -> ~/.agents/skills`, or two `*_HOME` overrides
// pointing at the same place. Such hosts are a single install target, and
// treating them as separate ones publishes the same skill into the same
// directory twice — concurrently, so one copy fails with EEXIST while the
// other is still writing. Hosts are therefore collapsed by the real path of
// their skills directory. The always-provisioned universal host yields to a
// concrete agent sharing its directory, because skill content is rendered per
// agent and the concrete agent's rendering is the more specific one; otherwise
// the first host in agent declaration order is kept.
async function collapseAliasedManagedSkillHosts(
    hosts: readonly ManagedSkillHost[],
): Promise<ManagedSkillHost[]> {
    const identifiedHosts = await Promise.all(
        hosts.map(async host => ({
            host,
            skillsDirectoryIdentity: await resolveManagedSkillsDirectoryIdentity(
                host.homeDirectory,
            ),
        })),
    );
    const hostsByIdentity = new Map<string, ManagedSkillHost>();

    for (const identifiedHost of identifiedHosts) {
        const collapsedHost = hostsByIdentity.get(
            identifiedHost.skillsDirectoryIdentity,
        );

        if (
            collapsedHost !== undefined
            && readManagedSkillAgent(collapsedHost.agentName).alwaysProvision !== true
        ) {
            continue;
        }

        hostsByIdentity.set(
            identifiedHost.skillsDirectoryIdentity,
            identifiedHost.host,
        );
    }

    return [...hostsByIdentity.values()];
}

// A host is identified by the real path of the directory its skills are
// published into. The skills directory is created on demand, so a host that
// does not have one yet falls back to its resolved home directory, which still
// collapses an aliased home before its first publication. A path that cannot be
// resolved at all is its own identity, which simply leaves the host uncollapsed.
async function resolveManagedSkillsDirectoryIdentity(
    homeDirectory: string,
): Promise<string> {
    const skillsDirectoryPath = resolveManagedSkillsDirectoryPath(homeDirectory);
    const resolvedSkillsDirectoryPath = await readRealPath(skillsDirectoryPath);

    if (resolvedSkillsDirectoryPath !== undefined) {
        return resolvedSkillsDirectoryPath;
    }

    const resolvedHomeDirectory = await readRealPath(homeDirectory);

    return resolvedHomeDirectory === undefined
        ? skillsDirectoryPath
        : resolveManagedSkillsDirectoryPath(resolvedHomeDirectory);
}

async function readRealPath(path: string): Promise<string | undefined> {
    try {
        return await realpath(path);
    }
    catch {
        // Missing, inaccessible, or otherwise unresolvable paths carry no
        // identity to compare; the caller falls back to the literal path.
        return undefined;
    }
}

export function resolveManagedSkillHostInstallation(
    host: ManagedSkillHost,
    skillName: string,
): ManagedSkillHostInstallation {
    return {
        ...host,
        installedSkillDirectoryPath: resolveManagedSkillDirectoryPath(
            host.homeDirectory,
            skillName,
        ),
    };
}

export function resolveManagedSkillHostInstallations(
    hosts: readonly ManagedSkillHost[],
    skillName: string,
): ManagedSkillHostInstallation[] {
    return hosts.map(host => resolveManagedSkillHostInstallation(host, skillName));
}

export function createMissingManagedSkillHostError(
    env: Record<string, string | undefined>,
): CliUserError {
    return new CliUserError("errors.skills.noSupportedBundledSkillHosts", 1, {
        paths: availableBundledSkillAgentNames
            .map(agentName => resolveManagedSkillAgentHomeDirectory(env, agentName))
            .join(", "),
    });
}
