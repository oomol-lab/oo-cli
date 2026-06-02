import type { BundledSkillAgentName } from "./managed-skill-agents.ts";

import { CliUserError } from "../../contracts/cli.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
import {
    availableBundledSkillAgentNames,
    readManagedSkillAgent,
    resolveManagedSkillAgentHomeDirectory,
} from "./managed-skill-agents.ts";
import { resolveManagedSkillDirectoryPath } from "./managed-skill-paths.ts";

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

    return hosts.filter(host => host !== undefined);
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
