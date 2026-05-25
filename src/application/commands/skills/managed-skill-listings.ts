import type { BundledSkillAgentName } from "./embedded-assets.ts";
import type { ManagedSkillHost } from "./managed-skill-hosts.ts";
import type { SkillMarkdownMatter } from "./skill-frontmatter.ts";
import type {
    RegistrySkillMetadata,
    SkillMetadata,
} from "./skill-metadata.ts";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import {
    availableBundledSkillNames,
} from "./embedded-assets.ts";
import { listLocalSkillSources } from "./local-skill-source.ts";
import {
    compareManagedSkillAgentNames,
} from "./managed-skill-agents.ts";
import {
    resolveManagedSkillMetadataFilePath,
    resolveManagedSkillsDirectoryPath,
} from "./managed-skill-paths.ts";
import { isBundledSkillName } from "./shared.ts";
import {
    hasFrontmatter,
    isSkillFrontmatterRecord,
    parseSkillMarkdownMatter,
    toNonBlankString,
} from "./skill-frontmatter.ts";
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

export interface LocalSkillListItem {
    hostName?: BundledSkillAgentName;
    metadata?: SkillListDisplayMetadata;
    name: string;
    path: string;
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

export async function listLocalSkillInstallations(
    localSkillsDirectoryPath: string,
): Promise<LocalSkillListItem[]> {
    const entries = await readSkillsDirectoryEntries(localSkillsDirectoryPath);
    const skills = await Promise.all(
        entries.map(entryName =>
            readLocalSkillListItem(localSkillsDirectoryPath, entryName),
        ),
    );

    return skills
        .filter(skill => skill !== undefined)
        .sort(compareLocalSkillListItems);
}

export async function listLocalSkillInstallationsForContext(
    context: {
        env: Record<string, string | undefined>;
    },
    options: {
        agentName?: BundledSkillAgentName;
    } = {},
): Promise<LocalSkillListItem[]> {
    const sources = await listLocalSkillSources(context, options);
    const skills = await Promise.all(
        sources.map(source => readLocalSkillListItemFromPath(source.path, {
            hostName: source.agentName,
            name: source.name,
        })),
    );

    return skills
        .filter(skill => skill !== undefined)
        .sort(compareLocalSkillListItems);
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

export function createSkillListDisplayMetadata(
    metadata: SkillMetadata | undefined,
): SkillListDisplayMetadata | undefined {
    if (metadata === undefined) {
        return undefined;
    }

    switch (metadata.kind) {
        case "bundled":
            return {
                kind: metadata.kind,
                version: metadata.version,
            };
        case "local":
            return {
                kind: metadata.kind,
            };
        case "registry":
            return createRegistrySkillListDisplayMetadata(metadata);
    }
}

function createRegistrySkillListDisplayMetadata(
    metadata: RegistrySkillMetadata,
): SkillListDisplayMetadata {
    return {
        ...(metadata.icon === undefined ? {} : { icon: metadata.icon }),
        kind: metadata.kind,
        packageName: metadata.packageName,
        version: metadata.version,
    };
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

async function readLocalSkillListItem(
    localSkillsDirectoryPath: string,
    entryName: string,
): Promise<LocalSkillListItem | undefined> {
    return await readLocalSkillListItemFromPath(
        join(localSkillsDirectoryPath, entryName),
        { name: entryName },
    );
}

async function readLocalSkillListItemFromPath(
    skillDirectoryPath: string,
    options: {
        hostName?: BundledSkillAgentName;
        name: string;
    },
): Promise<LocalSkillListItem | undefined> {
    let content: string;

    try {
        content = await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8");
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }

    const parsed = parseLocalSkillListItem(content, options.name);

    if (parsed === undefined) {
        return undefined;
    }

    return {
        hostName: options.hostName,
        metadata: parsed.metadata,
        name: options.name,
        path: skillDirectoryPath,
    };
}

function parseLocalSkillListItem(
    content: string,
    skillName: string,
): Pick<LocalSkillListItem, "metadata"> | undefined {
    let parsed: SkillMarkdownMatter;

    try {
        parsed = parseSkillMarkdownMatter(content);
    }
    catch {
        return undefined;
    }

    if (!hasFrontmatter(content) || !isSkillFrontmatterRecord(parsed.data)) {
        return undefined;
    }

    const frontmatterName = toNonBlankString(parsed.data.name);
    const description = toNonBlankString(parsed.data.description);

    if (frontmatterName !== skillName || description === undefined) {
        return undefined;
    }

    const metadata = parsed.data.metadata;

    if (metadata !== undefined && !isSkillFrontmatterRecord(metadata)) {
        return undefined;
    }

    const version = toNonBlankString(metadata?.version);

    if (version === undefined) {
        return {};
    }

    const icon = toNonBlankString(metadata?.icon);
    const packageName = toNonBlankString(metadata?.packageName);

    return {
        metadata: {
            ...(icon === undefined ? {} : { icon }),
            ...(packageName === undefined ? {} : { packageName }),
            version,
        },
    };
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

function compareLocalSkillListItems(
    left: LocalSkillListItem,
    right: LocalSkillListItem,
): number {
    const nameDifference = left.name.localeCompare(right.name);

    if (nameDifference !== 0) {
        return nameDifference;
    }

    return (left.hostName ?? "").localeCompare(right.hostName ?? "");
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
