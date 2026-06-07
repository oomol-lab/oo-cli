import type { BundledSkillAgentName } from "./embedded-assets.ts";
import type { ManagedSkillHost } from "./managed-skill-hosts.ts";
import type {
    SkillMetadata,
} from "./skill-metadata.ts";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import {
    availableBundledSkillNames,
} from "./embedded-assets.ts";
import {
    compareManagedSkillAgentNames,
} from "./managed-skill-agents.ts";
import {
    resolveManagedSkillMetadataFilePath,
    resolveManagedSkillsDirectoryPath,
} from "./managed-skill-paths.ts";
import { isBundledSkillName } from "./shared.ts";

import { parseSkillMetadataContent } from "./skill-metadata.ts";

export const skillListSourceValues = ["bundled", "registry", "local"] as const;
export type SkillListSource = (typeof skillListSourceValues)[number];

export interface ManagedSkillListItem {
    metadata?: SkillMetadata;
    name: string;
    path: string;
    source?: SkillListSource;
}

export interface ManagedSkillHostListItem extends ManagedSkillListItem {
    hostName: BundledSkillAgentName;
}

export interface SkillListDisplayMetadata {
    icon?: string;
    kind?: SkillMetadata["kind"];
    packageName?: string;
    version?: string;
}

interface SkillListSortableItem {
    metadata?: SkillListDisplayMetadata;
    name: string;
    source?: SkillListSource;
}

export async function listManagedSkillInstallationsForHosts(
    hosts: readonly ManagedSkillHost[],
): Promise<ManagedSkillHostListItem[]> {
    const skillsByHost = await Promise.all(
        hosts.map(host =>
            listManagedSkillInstallations(
                resolveManagedSkillsDirectoryPath(host.homeDirectory),
            )
                .then(skills => skills.map(skill => ({
                    ...skill,
                    hostName: host.agentName,
                }) satisfies ManagedSkillHostListItem)),
        ),
    );

    return skillsByHost
        .flat()
        .sort(compareManagedSkillHostListItems);
}

export async function listManagedSkillInstallations(
    skillsDirectoryPath: string,
): Promise<ManagedSkillListItem[]> {
    const entries = await readSkillsDirectoryEntries(skillsDirectoryPath);
    const skills: Array<ManagedSkillListItem | undefined> = await Promise.all(
        entries.map(async (entryName) => {
            const skillDirectoryPath = join(skillsDirectoryPath, entryName);
            const metadataFilePath = resolveManagedSkillMetadataFilePath(
                skillDirectoryPath,
            );

            let metadataContent: string;

            try {
                metadataContent = await readFile(metadataFilePath, "utf8");
            }
            catch (error) {
                if (isNodeNotFoundError(error)) {
                    return undefined;
                }

                throw error;
            }

            const metadata = parseSkillMetadataContent(metadataContent);

            return {
                metadata,
                name: entryName,
                path: skillDirectoryPath,
                source: readManagedSkillListSource({
                    metadata,
                    name: entryName,
                }),
            } satisfies ManagedSkillListItem;
        }),
    );

    return skills
        .filter(skill => skill !== undefined)
        .sort(compareManagedSkillListItems);
}

export function readManagedSkillListSource(
    skill: Pick<ManagedSkillListItem, "metadata" | "name">,
): SkillListSource {
    if (skill.metadata?.kind === "local") {
        return "local";
    }

    if (skill.metadata?.kind === "bundled") {
        return "bundled";
    }

    if (skill.metadata?.kind === "registry") {
        return "registry";
    }

    return isBundledSkillName(skill.name) ? "bundled" : "registry";
}

export async function readSkillsDirectoryEntries(
    skillsDirectoryPath: string,
): Promise<string[]> {
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

function compareManagedSkillListItems(
    left: SkillListSortableItem,
    right: SkillListSortableItem,
): number {
    const leftBundledOrder = readBundledSkillNameOrder(left);
    const rightBundledOrder = readBundledSkillNameOrder(right);

    if (leftBundledOrder !== undefined && rightBundledOrder !== undefined) {
        return leftBundledOrder - rightBundledOrder;
    }

    if (leftBundledOrder !== undefined) {
        return -1;
    }

    if (rightBundledOrder !== undefined) {
        return 1;
    }

    return left.name.localeCompare(right.name);
}

function readBundledSkillNameOrder(
    skill: SkillListSortableItem,
): number | undefined {
    if (
        skill.metadata?.packageName !== undefined
        || skill.source === "local"
        || !isBundledSkillName(skill.name)
    ) {
        return undefined;
    }

    return availableBundledSkillNames.indexOf(skill.name);
}

function compareManagedSkillHostListItems(
    left: ManagedSkillHostListItem,
    right: ManagedSkillHostListItem,
): number {
    const hostOrderDifference = compareManagedSkillAgentNames(
        left.hostName,
        right.hostName,
    );

    if (hostOrderDifference !== 0) {
        return hostOrderDifference;
    }

    return compareManagedSkillListItems(left, right);
}
