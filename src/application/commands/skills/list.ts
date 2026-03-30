import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

import type { ManagedSkillMetadata } from "./managed-skill-metadata.ts";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createWriterColors } from "../../terminal-colors.ts";
import {
    directoryExists,
    fileExists,
    requireCodexHomeDirectory,
} from "./bundled-skill-observation.ts";
import { availableBundledSkillNames } from "./embedded-assets.ts";
import { readManagedSkillMetadata } from "./managed-skill-metadata.ts";
import { resolveManagedSkillMetadataFilePath } from "./managed-skill-paths.ts";

const managedSkillNameColor = "#59F78D";
const managedSkillSourceColor = "#CAA8FA";
const managedSkillVersionColor = "#7DD3FC";
const codexSkillsDirectoryName = "skills";

export interface ManagedSkillListItem {
    metadata?: ManagedSkillMetadata;
    name: string;
    path: string;
}

interface SkillsListInput {}

type ManagedSkillListTextContext = Pick<CliExecutionContext, "stdout" | "translator">;

export const skillsListCommand: CliCommandDefinition<SkillsListInput> = {
    name: "list",
    summaryKey: "commands.skills.list.summary",
    descriptionKey: "commands.skills.list.description",
    inputSchema: z.object({}),
    handler: async (_, context) => {
        const codexHomeDirectory = await requireCodexHomeDirectory(context);
        const skillsDirectoryPath = join(
            codexHomeDirectory,
            codexSkillsDirectoryName,
        );
        const skills = await listManagedSkillInstallations(skillsDirectoryPath);

        context.logger.info(
            {
                count: skills.length,
                path: skillsDirectoryPath,
                skillNames: skills.map(skill => skill.name),
            },
            "Managed Codex skills listed.",
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

export async function listManagedSkillInstallations(
    skillsDirectoryPath: string,
): Promise<ManagedSkillListItem[]> {
    const entryNames = await readSkillsDirectoryEntries(skillsDirectoryPath);
    const skills: Array<ManagedSkillListItem | undefined> = await Promise.all(
        entryNames.map(async (entryName) => {
            const skillDirectoryPath = join(skillsDirectoryPath, entryName);

            if (!(await directoryExists(skillDirectoryPath))) {
                return undefined;
            }

            if (
                !(await fileExists(
                    resolveManagedSkillMetadataFilePath(skillDirectoryPath),
                ))
            ) {
                return undefined;
            }

            return {
                metadata: await readManagedSkillMetadata(skillDirectoryPath),
                name: entryName,
                path: skillDirectoryPath,
            } satisfies ManagedSkillListItem;
        }),
    );

    return skills
        .filter(isManagedSkillListItem)
        .sort(compareManagedSkillListItems);
}

export function formatManagedSkillListAsText(
    inventory: {
        skills: readonly ManagedSkillListItem[];
    },
    context: ManagedSkillListTextContext,
): string {
    const colors = createManagedSkillListColors(context);

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
        return await readdir(skillsDirectoryPath);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return [];
        }

        throw error;
    }
}

function formatManagedSkillListItem(
    skill: ManagedSkillListItem,
    context: ManagedSkillListTextContext,
    colors: TerminalColors,
): string {
    const lines = [
        colors.hex(managedSkillNameColor).bold(skill.name),
        formatManagedSkillDetailLine(
            context.translator.t("skills.list.source"),
            colors.hex(managedSkillSourceColor)(readManagedSkillSource(skill, context)),
            colors,
        ),
        formatManagedSkillDetailLine(
            context.translator.t("skills.list.version"),
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

    if (
        availableBundledSkillNames.includes(
            skill.name as (typeof availableBundledSkillNames)[number],
        )
    ) {
        return context.translator.t("skills.list.source.bundled");
    }

    return context.translator.t("versionInfo.unknown");
}

function createManagedSkillListColors(
    context: Pick<CliExecutionContext, "stdout">,
): TerminalColors {
    return createWriterColors(context.stdout);
}

function isNodeNotFoundError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function isManagedSkillListItem(
    skill: ManagedSkillListItem | undefined,
): skill is ManagedSkillListItem {
    return skill !== undefined;
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
