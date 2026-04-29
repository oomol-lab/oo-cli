import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";
import type { ManagedSkillHost } from "./managed-skill-hosts.ts";

import type { ManagedSkillMetadata } from "./managed-skill-metadata.ts";
import { readdir, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { compareSemver } from "../../semver.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import {
    resolveAvailableManagedSkillHosts,
} from "./managed-skill-hosts.ts";
import { parseManagedSkillMetadataContent } from "./managed-skill-metadata.ts";
import {
    isPathWithinDirectory,
    resolveLocalSkillCanonicalRootDirectoryPath,
    resolveManagedSkillMetadataFilePath,
    resolveManagedSkillsDirectoryPath,
} from "./managed-skill-paths.ts";
import { isBundledSkillName } from "./shared.ts";

const managedSkillNameColor = "#59F78D";
const managedSkillSourceColor = "#CAA8FA";
const managedSkillVersionColor = "#7DD3FC";
const managedSkillHostOrder = {
    codex: 0,
    claude: 1,
    codebuddy: 2,
    workbuddy: 3,
    openclaw: 4,
    qoderwork: 5,
} as const satisfies Record<BundledSkillAgentName, number>;

export interface ManagedSkillListItem {
    metadata?: ManagedSkillMetadata;
    name: string;
    path: string;
    source?: "local";
}

export interface ManagedSkillHostListItem extends ManagedSkillListItem {
    hostName: BundledSkillAgentName;
}

interface ManagedSkillOutputListItem {
    hostNames: BundledSkillAgentName[];
    metadata?: ManagedSkillMetadata;
    name: string;
    paths: string[];
    source?: "local";
}

type ManagedSkillListTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

export const skillsListCommand: CliCommandDefinition<Record<string, never>> = {
    name: "list",
    summaryKey: "commands.skills.list.summary",
    descriptionKey: "commands.skills.list.description",
    inputSchema: z.object({}),
    handler: async (_, context) => {
        const skills = groupManagedSkillInstallationsByIdentity(
            await listManagedSkillInstallationsByHost(context),
        );

        context.logger.info(
            {
                count: skills.length,
                paths: skills.flatMap(skill => skill.paths),
                skillNames: skills.map(skill => skill.name),
            },
            "Managed skills listed.",
        );

        context.stdout.write(
            `${
                formatManagedSkillListAsText({
                    skills,
                }, context)
            }\n`,
        );
    },
};

async function listManagedSkillInstallationsByHost(
    context: Pick<CliExecutionContext, "env" | "settingsStore">,
): Promise<ManagedSkillHostListItem[]> {
    return listManagedSkillInstallationsForHosts(
        await resolveAvailableManagedSkillHosts(context.env),
        context.settingsStore.getFilePath(),
    );
}

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

function groupManagedSkillInstallationsByIdentity(
    installations: readonly ManagedSkillHostListItem[],
): ManagedSkillOutputListItem[] {
    const groups: ManagedSkillOutputListItem[] = [];

    for (const installation of installations) {
        const group = groups.find(candidate =>
            hasSameManagedSkillIdentity(candidate, installation),
        );

        if (group === undefined) {
            groups.push({
                hostNames: [installation.hostName],
                metadata: installation.metadata,
                name: installation.name,
                paths: [installation.path],
                source: installation.source,
            });
            continue;
        }

        group.hostNames.push(installation.hostName);
        group.paths.push(installation.path);
    }

    return groups.sort(compareManagedSkillOutputListItems);
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

export function formatManagedSkillListAsText(
    inventory: {
        skills: readonly ManagedSkillOutputListItem[];
    },
    context: ManagedSkillListTextContext,
): string {
    const colors = createWriterColors(context.stdout);

    if (inventory.skills.length === 0) {
        return `${colors.yellow("!")} ${context.translator.t("skills.list.noResults")}`;
    }

    const blocks = inventory.skills.map(
        skill => formatManagedSkillListItem(skill, context, colors),
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

function formatManagedSkillListItem(
    skill: ManagedSkillOutputListItem,
    context: ManagedSkillListTextContext,
    colors: TerminalColors,
): string {
    const lines = [
        colors.bold(colors.hex(managedSkillNameColor)(skill.name)),
        formatManagedSkillDetailLine(
            context.translator.t("skills.list.host"),
            colors.hex(managedSkillSourceColor)(
                readManagedSkillHostLabels(skill.hostNames, context),
            ),
            colors,
        ),
        formatManagedSkillDetailLine(
            context.translator.t("skills.list.source"),
            colors.hex(managedSkillSourceColor)(readManagedSkillSource(skill, context)),
            colors,
        ),
        formatManagedSkillDetailLine(
            context.translator.t("labels.version"),
            colors.hex(managedSkillVersionColor)(
                skill.metadata?.version ?? context.translator.t("versionInfo.unknown"),
            ),
            colors,
        ),
    ];

    return lines.join("\n");
}

function formatManagedSkillDetailLine(
    label: string,
    value: string,
    colors: TerminalColors,
): string {
    return `  ${colors.dim(`${label}:`)} ${value}`;
}

function readManagedSkillSource(
    skill: Pick<ManagedSkillListItem, "metadata" | "name" | "source">,
    context: Pick<CliExecutionContext, "translator">,
): string {
    if (skill.metadata?.packageName !== undefined) {
        return skill.metadata.packageName;
    }

    if ("source" in skill && skill.source === "local") {
        return context.translator.t("skills.list.source.local");
    }

    if (isBundledSkillName(skill.name)) {
        return context.translator.t("skills.list.source.bundled");
    }

    return context.translator.t("versionInfo.unknown");
}

function readManagedSkillSourceIdentity(
    skill: Pick<ManagedSkillListItem, "metadata" | "name" | "source">,
): string {
    if (skill.metadata?.packageName !== undefined) {
        return `package:${skill.metadata.packageName}`;
    }

    if (skill.source === "local") {
        return "local";
    }

    if (isBundledSkillName(skill.name)) {
        return "bundled";
    }

    return "unknown";
}

function readManagedSkillHostLabels(
    hostNames: readonly BundledSkillAgentName[],
    context: Pick<CliExecutionContext, "translator">,
): string {
    return hostNames.map(hostName =>
        readManagedSkillHostLabel(hostName, context),
    ).join(", ");
}

function readManagedSkillHostLabel(
    hostName: BundledSkillAgentName,
    context: Pick<CliExecutionContext, "translator">,
): string {
    switch (hostName) {
        case "claude":
            return context.translator.t("skills.list.host.claude");
        case "codebuddy":
            return context.translator.t("skills.list.host.codebuddy");
        case "codex":
            return context.translator.t("skills.list.host.codex");
        case "openclaw":
            return context.translator.t("skills.list.host.openclaw");
        case "qoderwork":
            return context.translator.t("skills.list.host.qoderwork");
        case "workbuddy":
            return context.translator.t("skills.list.host.workbuddy");
        default:
            return hostName satisfies never;
    }
}

function hasSameManagedSkillIdentity(
    left: Pick<ManagedSkillListItem, "metadata" | "name" | "source">,
    right: Pick<ManagedSkillListItem, "metadata" | "name" | "source">,
): boolean {
    return left.name === right.name
        && readManagedSkillSourceIdentity(left) === readManagedSkillSourceIdentity(right)
        && (left.metadata?.version ?? "") === (right.metadata?.version ?? "");
}

function compareManagedSkillListItems(
    left: Pick<ManagedSkillListItem, "metadata" | "name" | "source">,
    right: Pick<ManagedSkillListItem, "metadata" | "name" | "source">,
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
    skill: Pick<ManagedSkillListItem, "metadata" | "name" | "source">,
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

function compareManagedSkillOutputListItems(
    left: ManagedSkillOutputListItem,
    right: ManagedSkillOutputListItem,
): number {
    const nameDifference = compareManagedSkillListItems(left, right);

    if (nameDifference !== 0) {
        return nameDifference;
    }

    const sourceDifference = readManagedSkillSourceIdentity(left)
        .localeCompare(readManagedSkillSourceIdentity(right));

    if (sourceDifference !== 0) {
        return sourceDifference;
    }

    return compareSemver(
        left.metadata?.version ?? "",
        right.metadata?.version ?? "",
    );
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
