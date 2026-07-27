import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";
import type {
    SkillHostControlState,
    SkillInventory,
    SkillInventoryEntry,
    SkillInventoryHostEntry,
    SkillInventoryKind,
} from "./info-inventory.ts";

import type { SkillListSource } from "./managed-skill-listings.ts";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { collectSkillsInfoInventory } from "./info-inventory.ts";
import {
    parseManagedSkillAgentOption,
    readManagedSkillAgentLabel,
} from "./managed-skill-agents.ts";
import { skillListSourceValues } from "./managed-skill-listings.ts";

const managedSkillNameColor = "#59F78D";
const managedSkillDetailColor = "#CAA8FA";
const managedSkillVersionColor = "#7DD3FC";

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
    output: "standard",
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

        const inventory = await collectSkillsInfoInventory(context, {
            agentName,
            source: input.source,
        });

        context.logger.info(
            {
                count: inventory.skills.length,
                summary: inventory.summary,
                source: input.source,
            },
            "Skills listed.",
        );

        context.output.emit(inventory, () => {
            context.stdout.write(`${formatInventoryAsText(inventory, context)}\n`);
        });
    },
};

function parseSkillListAgent(
    value: string | undefined,
): BundledSkillAgentName | undefined {
    return parseManagedSkillAgentOption(value, "errors.skills.list.invalidAgent");
}

function formatInventoryAsText(
    inventory: SkillInventory,
    context: Pick<CliExecutionContext, "stdout" | "translator">,
): string {
    const colors = createWriterColors(context.stdout);

    if (inventory.skills.length === 0) {
        return `${colors.yellow("!")} ${context.translator.t("skills.list.noResults")}`;
    }

    const headerLabel = context.translator.t("skills.info.summary", {
        count: inventory.skills.length,
        bundled: inventory.summary.bundledSkills,
        registry: inventory.summary.registrySkills,
        local: inventory.summary.localSkills,
    });
    const skillBlocks = inventory.skills.map(skill =>
        formatSkillBlock(skill, context, colors),
    );

    return [
        `${colors.green("✓")} ${headerLabel}`,
        ...skillBlocks,
    ].join("\n\n");
}

function formatSkillBlock(
    skill: SkillInventoryEntry,
    context: Pick<CliExecutionContext, "translator">,
    colors: TerminalColors,
): string {
    const lines: string[] = [
        colors.bold(colors.hex(managedSkillNameColor)(skill.name)),
        formatDetailLine(
            context.translator.t("skills.info.kind"),
            colors.hex(managedSkillDetailColor)(
                context.translator.t(`skills.info.kind.${skill.kind}`),
            ),
            colors,
        ),
        formatPackageLine(skill, context, colors),
        formatDetailLine(
            context.translator.t("labels.version"),
            colors.hex(managedSkillVersionColor)(
                skill.version ?? context.translator.t("versionInfo.unknown"),
            ),
            colors,
        ),
    ];

    if (skill.description !== "") {
        lines.push(
            formatDetailLine(
                context.translator.t("skills.info.description"),
                skill.description,
                colors,
            ),
        );
    }

    lines.push(formatHostsBlock(skill, context, colors));

    return lines.join("\n");
}

function formatPackageLine(
    skill: SkillInventoryEntry,
    context: Pick<CliExecutionContext, "translator">,
    colors: TerminalColors,
): string {
    const displayName = skill.packageName ?? resolvePackagePlaceholder(skill.kind, context);

    return formatDetailLine(
        context.translator.t("skills.list.package"),
        colors.hex(managedSkillDetailColor)(displayName),
        colors,
    );
}

function resolvePackagePlaceholder(
    kind: SkillInventoryKind,
    context: Pick<CliExecutionContext, "translator">,
): string {
    switch (kind) {
        case "bundled":
            return context.translator.t("skills.info.package.internal");
        case "local":
            return context.translator.t("skills.info.package.local");
        case "registry":
            return context.translator.t("versionInfo.unknown");
    }
}

function formatHostsBlock(
    skill: SkillInventoryEntry,
    context: Pick<CliExecutionContext, "translator">,
    colors: TerminalColors,
): string {
    const hostsLabel = context.translator.t("skills.info.hosts");
    const headerLine = `  ${colors.dim(`${hostsLabel}:`)}`;
    const hostLines = skill.hosts.map(host =>
        formatHostLine(host, context, colors),
    );

    return [headerLine, ...hostLines].join("\n");
}

function formatHostLine(
    host: SkillInventoryHostEntry,
    context: Pick<CliExecutionContext, "translator">,
    colors: TerminalColors,
): string {
    const agentLabel = readManagedSkillAgentLabel(host.agentId, context.translator);
    const statusLabel = context.translator.t(`skills.info.host.status.${host.status}`);
    const controlLabel = context.translator.t(
        `skills.info.host.controlState.${host.controlState}`,
    );
    const controlColored = colorizeControlState(host.controlState, controlLabel, colors);
    const agentText = colors.hex(managedSkillDetailColor)(agentLabel);
    const statusText = colors.dim(statusLabel);

    return `    ${agentText}  ${statusText}  ${controlColored}`;
}

function colorizeControlState(
    controlState: SkillHostControlState,
    label: string,
    colors: TerminalColors,
): string {
    switch (controlState) {
        case "controlled":
            return colors.green(label);
        case "modified":
            return colors.yellow(label);
        case "non-managed":
            return colors.red(label);
        case "unknown":
            return colors.dim(label);
    }
}

function formatDetailLine(
    label: string,
    value: string,
    colors: TerminalColors,
): string {
    return `  ${colors.dim(`${label}:`)} ${value}`;
}
