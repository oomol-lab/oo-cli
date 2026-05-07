import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";
import type {
    ManagedSkillHost,
    ManagedSkillHostInstallation,
} from "./managed-skill-hosts.ts";

import type { ManagedSkillMetadata } from "./managed-skill-metadata.ts";
import type { SkillMarkdownMatter } from "./skill-frontmatter.ts";
import { readdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { compareSemver } from "../../semver.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import {
    hasMatchingSkillFileContent,
    readSkillFileContent,
} from "./local-skill-ownership.ts";
import {
    readManagedSkillHostLabels,
} from "./managed-skill-host-labels.ts";
import {
    resolveAvailableManagedSkillHosts,
    resolveManagedSkillHostInstallations,
} from "./managed-skill-hosts.ts";
import { parseManagedSkillMetadataContent } from "./managed-skill-metadata.ts";
import {
    isPathWithinDirectory,
    resolveLocalSkillCanonicalRootDirectoryPath,
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
const managedSkillHostOrder = {
    "codex": 0,
    "claude": 1,
    "hermes": 2,
    "codebuddy": 3,
    "workbuddy": 4,
    "trae": 5,
    "trae-cn": 6,
    "openclaw": 7,
    "qoderwork": 8,
} as const satisfies Record<BundledSkillAgentName, number>;

type SkillListSource = (typeof skillListSourceValues)[number];

export interface ManagedSkillListItem {
    metadata?: ManagedSkillMetadata;
    name: string;
    path: string;
    source?: "local";
}

export interface ManagedSkillHostListItem extends ManagedSkillListItem {
    hostName: BundledSkillAgentName;
}

interface SkillListOutputItem {
    hostNames: BundledSkillAgentName[];
    metadata?: ManagedSkillMetadata;
    name: string;
    paths: string[];
    source: SkillListSource;
}

interface SkillListSortableItem {
    metadata?: ManagedSkillMetadata;
    name: string;
    source?: SkillListSource;
}

export interface LocalSkillListItem {
    metadata?: ManagedSkillMetadata;
    name: string;
    path: string;
}

type ManagedSkillListTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

interface SkillsListInput {
    source?: SkillListSource;
}

export const skillsListCommand: CliCommandDefinition<SkillsListInput> = {
    name: "list",
    summaryKey: "commands.skills.list.summary",
    descriptionKey: "commands.skills.list.description",
    options: [
        {
            name: "source",
            longFlag: "--source",
            shortFlag: "-s",
            valueName: "source",
            descriptionKey: "options.skillListSource",
        },
    ],
    inputSchema: z.object({
        source: z.enum(skillListSourceValues).optional(),
    }),
    mapInputError: (_, rawInput) => new CliUserError(
        "errors.skills.list.invalidSource",
        2,
        { value: String(rawInput.source ?? "") },
    ),
    handler: async (input, context) => {
        const skills = filterSkillListOutputItems(
            await listSkillOutputItems(context),
            input.source,
        );

        context.logger.info(
            {
                count: skills.length,
                paths: skills.flatMap(skill => skill.paths),
                skillNames: skills.map(skill => skill.name),
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
    settingsFilePath?: string,
): Promise<ManagedSkillHostListItem[]> {
    const skillsByHost = await Promise.all(
        hosts.map(host =>
            listManagedSkillInstallations(
                resolveManagedSkillsDirectoryPath(host.homeDirectory),
                settingsFilePath,
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
    context: Pick<CliExecutionContext, "env" | "settingsStore">,
): Promise<SkillListOutputItem[]> {
    const settingsFilePath = context.settingsStore.getFilePath();
    const availableHosts = await resolveAvailableManagedSkillHosts(context.env);
    const [managedInstallations, localInstallations] = await Promise.all([
        listManagedSkillInstallationsForHosts(availableHosts, settingsFilePath),
        listLocalSkillInstallations(
            resolveLocalSkillCanonicalRootDirectoryPath(settingsFilePath),
        ),
    ]);
    const localOutputItems = await createLocalSkillOutputItems(
        localInstallations,
        availableHosts,
    );

    return groupSkillListInstallationsByIdentity([
        ...managedInstallations.map(createManagedSkillOutputItem),
        ...localOutputItems,
    ]);
}

function createManagedSkillOutputItem(
    installation: ManagedSkillHostListItem,
): SkillListOutputItem {
    const source = readManagedSkillListSource(installation);

    return {
        hostNames: [installation.hostName],
        metadata: installation.metadata,
        name: installation.name,
        paths: [installation.path],
        source,
    };
}

function createLocalSkillOutputItems(
    installations: readonly LocalSkillListItem[],
    hosts: readonly ManagedSkillHost[],
): Promise<SkillListOutputItem[]> {
    return Promise.all(installations.map(installation =>
        createLocalSkillOutputItem(
            installation,
            resolveManagedSkillHostInstallations(hosts, installation.name),
        ),
    ));
}

async function createLocalSkillOutputItem(
    installation: LocalSkillListItem,
    hostInstallations: readonly ManagedSkillHostInstallation[],
): Promise<SkillListOutputItem> {
    const matchingHostInstallations = await resolveLocalSkillHostInstallations(
        installation.path,
        hostInstallations,
    );

    return {
        hostNames: matchingHostInstallations.map(host => host.agentName),
        metadata: installation.metadata,
        name: installation.name,
        paths: [installation.path],
        source: "local",
    };
}

async function resolveLocalSkillHostInstallations(
    canonicalSkillDirectoryPath: string,
    hostInstallations: readonly ManagedSkillHostInstallation[],
): Promise<ManagedSkillHostInstallation[]> {
    const skillFileContent = await readSkillFileContent(canonicalSkillDirectoryPath);

    if (skillFileContent === undefined) {
        return [];
    }

    const matches = await Promise.all(
        hostInstallations.map(async installation =>
            await hasMatchingSkillFileContent({
                expectedContent: skillFileContent,
                skillDirectoryPath: installation.installedSkillDirectoryPath,
            })
                ? installation
                : undefined,
        ),
    );

    return matches.filter(match => match !== undefined);
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
        appendUniqueValues(group.paths, installation.paths);
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

function filterSkillListOutputItems(
    skills: readonly SkillListOutputItem[],
    source?: SkillListSource,
): SkillListOutputItem[] {
    if (source === undefined) {
        return [...skills];
    }

    return skills.filter(skill => skill.source === source);
}

export async function listManagedSkillInstallations(
    skillsDirectoryPath: string,
    settingsFilePath?: string,
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

            return {
                metadata: parseManagedSkillMetadataContent(metadataContent),
                name: entryName,
                path: skillDirectoryPath,
                source: await readManagedSkillLocalSource(
                    skillDirectoryPath,
                    settingsFilePath,
                ),
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
    const skillDirectoryPath = join(localSkillsDirectoryPath, entryName);
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

    const parsed = parseLocalSkillListItem(content, entryName);

    if (parsed === undefined) {
        return undefined;
    }

    return {
        metadata: parsed.metadata,
        name: entryName,
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
    skill: Pick<ManagedSkillListItem, "metadata" | "name" | "source">,
): SkillListSource {
    if (skill.source === "local") {
        return "local";
    }

    if (skill.metadata?.packageName === undefined && isBundledSkillName(skill.name)) {
        return "bundled";
    }

    return "registry";
}

function readSkillListHostName(
    skill: Pick<SkillListOutputItem, "hostNames">,
    context: Pick<CliExecutionContext, "translator">,
): string {
    if (skill.hostNames.length === 0) {
        return skillListLocalHostName;
    }

    return readManagedSkillHostLabels(skill.hostNames, context.translator);
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

async function readManagedSkillLocalSource(
    skillDirectoryPath: string,
    settingsFilePath?: string,
): Promise<"local" | undefined> {
    if (settingsFilePath === undefined) {
        return undefined;
    }

    try {
        const realSkillDirectoryPath = await realpath(skillDirectoryPath);

        return isPathWithinDirectory(
            resolveLocalSkillCanonicalRootDirectoryPath(settingsFilePath),
            realSkillDirectoryPath,
        )
            ? "local"
            : undefined;
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return undefined;
        }

        throw error;
    }
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
    return left.name.localeCompare(right.name);
}

function compareManagedSkillHostListItems(
    left: ManagedSkillHostListItem,
    right: ManagedSkillHostListItem,
): number {
    const hostOrderDifference
        = managedSkillHostOrder[left.hostName] - managedSkillHostOrder[right.hostName];

    if (hostOrderDifference !== 0) {
        return hostOrderDifference;
    }

    return compareManagedSkillListItems(left, right);
}
