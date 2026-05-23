import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";
import type {
    ManagedSkillHost,
} from "./managed-skill-hosts.ts";

import type { SkillMarkdownMatter } from "./skill-frontmatter.ts";
import type {
    RegistrySkillMetadata,
    SkillMetadata,
} from "./skill-metadata.ts";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { compareSemver } from "../../semver.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import {
    availableBundledSkillNames,
} from "./embedded-assets.ts";
import { listLocalSkillSources } from "./local-skill-source.ts";
import {
    compareManagedSkillAgentNames,
    parseManagedSkillAgentOption,
    readManagedSkillAgentLabels,
} from "./managed-skill-agents.ts";
import {
    resolveAvailableManagedSkillHosts,
} from "./managed-skill-hosts.ts";
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

const managedSkillNameColor = "#59F78D";
const managedSkillSourceColor = "#CAA8FA";
const managedSkillVersionColor = "#7DD3FC";
const skillListInternalPackageName = "<internal>";
const skillListLocalHostName = "<local>";
const skillListLocalPackageName = "<local>";
const skillListSourceValues = ["bundled", "registry", "local"] as const;
const skillListSourceOrder = {
    bundled: 0,
    registry: 1,
    local: 2,
} as const satisfies Record<SkillListSource, number>;

type SkillListSource = (typeof skillListSourceValues)[number];

export interface ManagedSkillListItem {
    metadata?: SkillMetadata;
    name: string;
    path: string;
    source?: SkillListSource;
}

export interface ManagedSkillHostListItem extends ManagedSkillListItem {
    hostName: BundledSkillAgentName;
}

interface SkillListOutputItem {
    hostNames: BundledSkillAgentName[];
    metadata?: SkillListDisplayMetadata;
    name: string;
    paths: string[];
    source: SkillListSource;
}

interface SkillListSortableItem {
    metadata?: SkillListDisplayMetadata;
    name: string;
    source?: SkillListSource;
}

export interface LocalSkillListItem {
    hostName?: BundledSkillAgentName;
    metadata?: SkillListDisplayMetadata;
    name: string;
    path: string;
}

interface SkillListDisplayMetadata {
    icon?: string;
    kind?: SkillMetadata["kind"];
    packageName?: string;
    version?: string;
}

type ManagedSkillListTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

interface SkillsListInput {
    agent?: string;
    source?: SkillListSource;
}

export const skillsListCommand: CliCommandDefinition<SkillsListInput> = {
    name: "info",
    aliases: ["list"],
    summaryKey: "commands.skills.info.summary",
    descriptionKey: "commands.skills.info.description",
    options: [
        {
            name: "agent",
            longFlag: "--agent",
            valueName: "agent",
            descriptionKey: "options.agent",
        },
        {
            name: "source",
            longFlag: "--source",
            shortFlag: "-s",
            valueName: "source",
            descriptionKey: "options.skillListSource",
        },
    ],
    inputSchema: z.object({
        agent: z.string().optional(),
        source: z.enum(skillListSourceValues).optional(),
    }),
    mapInputError: (_, rawInput) => new CliUserError(
        "errors.skills.list.invalidSource",
        2,
        { value: String(rawInput.source ?? "") },
    ),
    handler: async (input, context) => {
        const agentName = parseSkillListAgent(input.agent);
        context.telemetry?.recordProperties({
            has_agent_filter: input.agent !== undefined,
            source_filter: input.source ?? "none",
        });
        const skills = await listSkillOutputItems(context, {
            agentName,
            source: input.source,
        });

        context.logger.info(
            {
                count: skills.length,
                hasLocalPaths: skills.some(skill => skill.paths.length > 0),
                isLocal: input.source === "local",
                numberOfPaths: skills.reduce(
                    (total, skill) => total + skill.paths.length,
                    0,
                ),
                source: input.source,
            },
            "Skills listed.",
        );

        context.stdout.write(
            `${
                formatSkillListAsText({
                    skills,
                }, context)
            }\n`,
        );
    },
};

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

async function listSkillOutputItems(
    context: Pick<CliExecutionContext, "env">,
    options: {
        agentName?: BundledSkillAgentName;
        source?: SkillListSource;
    } = {},
): Promise<SkillListOutputItem[]> {
    const availableHosts = filterSkillListHosts(
        await resolveAvailableManagedSkillHosts(context.env),
        options.agentName,
    );
    if (options.source === "local") {
        return await listLocalSkillOutputItems(context, {
            agentName: options.agentName,
        });
    }

    const managedInstallations = await listManagedSkillInstallationsForHosts(
        availableHosts,
    );
    const managedOutputItems = groupSkillListInstallationsByIdentity(
        managedInstallations.map(createManagedSkillOutputItem),
    );

    if (options.source === undefined) {
        return managedOutputItems.filter(skill => skill.source !== "local");
    }

    return managedOutputItems.filter(skill => skill.source === options.source);
}

function createManagedSkillOutputItem(
    installation: ManagedSkillHostListItem,
): SkillListOutputItem {
    const source = readManagedSkillListSource(installation);

    return {
        hostNames: [installation.hostName],
        metadata: createSkillListDisplayMetadata(installation.metadata),
        name: installation.name,
        paths: [installation.path],
        source,
    };
}

async function listLocalSkillOutputItems(
    context: Pick<CliExecutionContext, "env">,
    options: {
        agentName?: BundledSkillAgentName;
    } = {},
): Promise<SkillListOutputItem[]> {
    const localInstallations = await listLocalSkillInstallationsForContext(
        {
            env: context.env,
        },
        options,
    );

    return localInstallations.map(installation => ({
        hostNames: installation.hostName === undefined ? [] : [installation.hostName],
        metadata: installation.metadata,
        name: installation.name,
        paths: [installation.path],
        source: "local",
    }));
}

function groupSkillListInstallationsByIdentity(
    installations: readonly SkillListOutputItem[],
): SkillListOutputItem[] {
    const groups: SkillListOutputItem[] = [];

    for (const installation of installations) {
        const group = groups.find(candidate =>
            hasSameSkillListIdentity(candidate, installation),
        );

        if (group === undefined) {
            groups.push(installation);
            continue;
        }

        appendUniqueValues(group.hostNames, installation.hostNames);

        if (group.source !== "local") {
            appendUniqueValues(group.paths, installation.paths);
        }
    }

    return groups.sort(compareSkillListOutputItems);
}

function appendUniqueValues<Value>(target: Value[], values: readonly Value[]): void {
    for (const value of values) {
        if (!target.includes(value)) {
            target.push(value);
        }
    }
}

function parseSkillListAgent(
    value: string | undefined,
): BundledSkillAgentName | undefined {
    return parseManagedSkillAgentOption(value, "errors.skills.list.invalidAgent");
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

async function listLocalSkillInstallationsForContext(
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

function formatSkillListAsText(
    inventory: {
        skills: readonly SkillListOutputItem[];
    },
    context: ManagedSkillListTextContext,
): string {
    const colors = createWriterColors(context.stdout);

    if (inventory.skills.length === 0) {
        return `${colors.yellow("!")} ${context.translator.t("skills.list.noResults")}`;
    }

    const blocks = inventory.skills.map(
        skill => formatSkillListItem(skill, context, colors),
    );

    return [
        `${colors.green("✓")} ${
            context.translator.t("skills.list.summary", {
                count: inventory.skills.length,
            })
        }`,
        ...blocks,
    ].join("\n\n");
}

async function readSkillsDirectoryEntries(
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

function formatSkillListItem(
    skill: SkillListOutputItem,
    context: ManagedSkillListTextContext,
    colors: TerminalColors,
): string {
    const packageLine = skill.source === "bundled"
        ? undefined
        : formatManagedSkillDetailLine(
                context.translator.t("skills.list.package"),
                colors.hex(managedSkillSourceColor)(
                    readSkillListPackageName(skill, context),
                ),
                colors,
            );
    const pathLine = skill.source === "local"
        ? formatManagedSkillDetailLine(
                context.translator.t("skills.list.path"),
                colors.hex(managedSkillSourceColor)(skill.paths.join(", ")),
                colors,
            )
        : undefined;
    const lines = [
        colors.bold(colors.hex(managedSkillNameColor)(skill.name)),
        formatManagedSkillDetailLine(
            context.translator.t("skills.list.host"),
            colors.hex(managedSkillSourceColor)(readSkillListHostName(skill, context)),
            colors,
        ),
        formatManagedSkillDetailLine(
            context.translator.t("skills.list.source"),
            colors.hex(managedSkillSourceColor)(skill.source),
            colors,
        ),
        packageLine,
        formatManagedSkillDetailLine(
            context.translator.t("labels.version"),
            colors.hex(managedSkillVersionColor)(
                skill.metadata?.version ?? context.translator.t("versionInfo.unknown"),
            ),
            colors,
        ),
        pathLine,
    ];

    return lines
        .filter(line => line !== undefined)
        .join("\n");
}

function formatManagedSkillDetailLine(
    label: string,
    value: string,
    colors: TerminalColors,
): string {
    return `  ${colors.dim(`${label}:`)} ${value}`;
}

function readManagedSkillListSource(
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

function readSkillListHostName(
    skill: Pick<SkillListOutputItem, "hostNames">,
    context: Pick<CliExecutionContext, "translator">,
): string {
    if (skill.hostNames.length === 0) {
        return skillListLocalHostName;
    }

    return readManagedSkillAgentLabels(skill.hostNames, context.translator);
}

function readSkillListPackageName(
    skill: Pick<SkillListOutputItem, "metadata" | "source">,
    context: Pick<CliExecutionContext, "translator">,
): string {
    if (skill.metadata?.packageName !== undefined) {
        return skill.metadata.packageName;
    }

    switch (skill.source) {
        case "bundled":
            return skillListInternalPackageName;
        case "local":
            return skillListLocalPackageName;
        case "registry":
            return context.translator.t("versionInfo.unknown");
    }
}

function readSkillListPackageIdentity(
    skill: Pick<SkillListOutputItem, "metadata" | "source">,
): string {
    return skill.metadata?.packageName ?? readSkillListFallbackPackageIdentity(skill);
}

function readSkillListFallbackPackageIdentity(
    skill: Pick<SkillListOutputItem, "source">,
): string {
    switch (skill.source) {
        case "bundled":
            return skillListInternalPackageName;
        case "local":
            return skillListLocalPackageName;
        case "registry":
            return "";
    }
}

function hasSameSkillListIdentity(
    left: SkillListOutputItem,
    right: SkillListOutputItem,
): boolean {
    if (left.source === "local" || right.source === "local") {
        return false;
    }

    return left.name === right.name
        && left.source === right.source
        && readSkillListPackageIdentity(left) === readSkillListPackageIdentity(right)
        && (left.metadata?.version ?? "") === (right.metadata?.version ?? "");
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

function createSkillListDisplayMetadata(
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

function compareSkillListOutputItems(
    left: SkillListOutputItem,
    right: SkillListOutputItem,
): number {
    const nameDifference = compareManagedSkillListItems(left, right);

    if (nameDifference !== 0) {
        return nameDifference;
    }

    const sourceDifference = skillListSourceOrder[left.source]
        - skillListSourceOrder[right.source];

    if (sourceDifference !== 0) {
        return sourceDifference;
    }

    const packageDifference = readSkillListPackageIdentity(left)
        .localeCompare(readSkillListPackageIdentity(right));

    if (packageDifference !== 0) {
        return packageDifference;
    }

    return compareSemver(
        left.metadata?.version ?? "",
        right.metadata?.version ?? "",
    );
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

function filterSkillListHosts(
    hosts: readonly ManagedSkillHost[],
    agentName: BundledSkillAgentName | undefined,
): ManagedSkillHost[] {
    if (agentName === undefined) {
        return [...hosts];
    }

    return hosts.filter(host => host.agentName === agentName);
}
