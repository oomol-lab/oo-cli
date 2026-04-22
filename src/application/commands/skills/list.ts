import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";

import type { ManagedSkillMetadata } from "./managed-skill-metadata.ts";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createWriterColors } from "../../terminal-colors.ts";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";
import {
    directoryExists,
} from "./bundled-skill-observation.ts";
import {
    codexSkillsDirectoryName,
    resolveBundledSkillHomeDirectory,
} from "./bundled-skill-paths.ts";
import {
    availableBundledSkillAgentNames,
} from "./embedded-assets.ts";
import { parseManagedSkillMetadataContent } from "./managed-skill-metadata.ts";
import {
    resolveManagedSkillMetadataFilePath,
} from "./managed-skill-paths.ts";
import { isBundledSkillName } from "./shared.ts";

const managedSkillNameColor = "#59F78D";
const managedSkillSourceColor = "#CAA8FA";
const managedSkillVersionColor = "#7DD3FC";
const managedSkillHostOrder = {
    codex: 0,
    claude: 1,
    openclaw: 2,
} as const satisfies Record<BundledSkillAgentName, number>;

export interface ManagedSkillListItem {
    metadata?: ManagedSkillMetadata;
    name: string;
    path: string;
}

interface ManagedSkillHostListItem extends ManagedSkillListItem {
    hostName: BundledSkillAgentName;
}

type ManagedSkillListTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

export const skillsListCommand: CliCommandDefinition<Record<string, never>> = {
    name: "list",
    summaryKey: "commands.skills.list.summary",
    descriptionKey: "commands.skills.list.description",
    inputSchema: z.object({}),
    handler: async (_, context) => {
        const skills = await listManagedSkillInstallationsByHost(context.env);

        context.logger.info(
            {
                count: skills.length,
                paths: skills.map(skill => skill.path),
                skillNames: skills.map(skill => `${skill.hostName}:${skill.name}`),
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
    env: Record<string, string | undefined>,
): Promise<ManagedSkillHostListItem[]> {
    const hostDirectories = await Promise.all(
        availableBundledSkillAgentNames.map(async (hostName) => {
            const homeDirectory = resolveBundledSkillHomeDirectory(env, hostName);

            return await directoryExists(homeDirectory)
                ? {
                        hostName,
                        skillsDirectoryPath: join(homeDirectory, codexSkillsDirectoryName),
                    }
                : undefined;
        }),
    );
    const skillsByHost = await Promise.all(
        hostDirectories.flatMap((hostDirectory) => {
            if (hostDirectory === undefined) {
                return [];
            }

            return [
                listManagedSkillInstallations(hostDirectory.skillsDirectoryPath)
                    .then(skills => skills.map(skill => ({
                        ...skill,
                        hostName: hostDirectory.hostName,
                    }) satisfies ManagedSkillHostListItem)),
            ];
        }),
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

            return {
                metadata: parseManagedSkillMetadataContent(metadataContent),
                name: entryName,
                path: skillDirectoryPath,
            } satisfies ManagedSkillListItem;
        }),
    );

    return skills
        .filter(skill => skill !== undefined)
        .sort(compareManagedSkillListItems);
}

export function formatManagedSkillListAsText(
    inventory: {
        skills: readonly ManagedSkillHostListItem[];
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
    skill: ManagedSkillHostListItem,
    context: ManagedSkillListTextContext,
    colors: TerminalColors,
): string {
    const lines = [
        colors.bold(colors.hex(managedSkillNameColor)(skill.name)),
        formatManagedSkillDetailLine(
            context.translator.t("skills.list.host"),
            colors.hex(managedSkillSourceColor)(
                readManagedSkillHostLabel(skill.hostName, context),
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
    skill: ManagedSkillListItem,
    context: Pick<CliExecutionContext, "translator">,
): string {
    if (skill.metadata?.packageName !== undefined) {
        return skill.metadata.packageName;
    }

    if (isBundledSkillName(skill.name)) {
        return context.translator.t("skills.list.source.bundled");
    }

    return context.translator.t("versionInfo.unknown");
}

function readManagedSkillHostLabel(
    hostName: BundledSkillAgentName,
    context: Pick<CliExecutionContext, "translator">,
): string {
    switch (hostName) {
        case "claude":
            return context.translator.t("skills.list.host.claude");
        case "codex":
            return context.translator.t("skills.list.host.codex");
        case "openclaw":
            return context.translator.t("skills.list.host.openclaw");
        default:
            return hostName satisfies never;
    }
}

function compareManagedSkillListItems(
    left: ManagedSkillListItem,
    right: ManagedSkillListItem,
): number {
    if (left.name === "oo" && right.name !== "oo") {
        return -1;
    }

    if (left.name !== "oo" && right.name === "oo") {
        return 1;
    }

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
