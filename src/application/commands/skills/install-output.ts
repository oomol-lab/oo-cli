import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";

import type { ManagedSkillHostTranslator } from "./managed-skill-host-labels.ts";
import { createWriterColors } from "../../terminal-colors.ts";
import { writeLine } from "../shared/output.ts";
import {

    readManagedSkillHostLabel,
} from "./managed-skill-host-labels.ts";

export interface ManagedSkillInstallPublication {
    agentName: BundledSkillAgentName;
    path: string;
}

export interface ManagedSkillInstallSummary {
    name: string;
    publications: readonly ManagedSkillInstallPublication[];
}

export function writeManagedSkillInstallSummary(
    context: Pick<CliExecutionContext, "stdout" | "translator">,
    summaries: readonly ManagedSkillInstallSummary[],
): void {
    const completedSummaries = summaries.filter(
        summary => summary.publications.length > 0,
    );

    if (completedSummaries.length === 0) {
        return;
    }

    const colors = createWriterColors(context.stdout);

    if (
        completedSummaries.length === 1
        && completedSummaries[0]!.publications.length === 1
    ) {
        const summary = completedSummaries[0]!;
        const publication = summary.publications[0]!;

        writeLine(
            context.stdout,
            context.translator.t("skills.install.success", {
                name: colors.cyan(summary.name),
                path: colors.dim(publication.path),
            }),
        );
        return;
    }

    const skillNames = completedSummaries.map(summary => summary.name);
    const agentNames = readUniqueAgentNames(completedSummaries);
    const installedLabel = colors.green(
        context.translator.t("skills.install.summary.installed"),
    );

    if (skillNames.length === 1) {
        writeLine(
            context.stdout,
            context.translator.t(
                "skills.install.summary.singleSkillMultipleAgents",
                {
                    agentCount: colors.bold(agentNames.length),
                    agentNames: formatAgentNames(
                        agentNames,
                        context.translator,
                        colors,
                    ),
                    skillName: colors.cyan(skillNames[0]!),
                    status: installedLabel,
                },
            ),
        );
        return;
    }

    if (agentNames.length === 1) {
        writeLine(
            context.stdout,
            context.translator.t(
                "skills.install.summary.multipleSkillsSingleAgent",
                {
                    agentName: formatAgentNames(
                        agentNames,
                        context.translator,
                        colors,
                    ),
                    skillCount: colors.bold(skillNames.length),
                    status: installedLabel,
                },
            ),
        );
        writeDetailLine(
            context,
            colors.bold(
                context.translator.t("skills.install.summary.skillsLabel"),
            ),
            formatSkillNames(skillNames, colors),
        );
        return;
    }

    writeLine(
        context.stdout,
        context.translator.t(
            "skills.install.summary.multipleSkillsMultipleAgents",
            {
                agentCount: colors.bold(agentNames.length),
                skillCount: colors.bold(skillNames.length),
                status: installedLabel,
            },
        ),
    );
    writeDetailLine(
        context,
        colors.bold(
            context.translator.t("skills.install.summary.agentsLabel"),
        ),
        formatAgentNames(agentNames, context.translator, colors),
    );
    writeDetailLine(
        context,
        colors.bold(
            context.translator.t("skills.install.summary.skillsLabel"),
        ),
        formatSkillNames(skillNames, colors),
    );
}

function readUniqueAgentNames(
    summaries: readonly ManagedSkillInstallSummary[],
): BundledSkillAgentName[] {
    const agentNames: BundledSkillAgentName[] = [];
    const seenAgentNames = new Set<BundledSkillAgentName>();

    for (const summary of summaries) {
        for (const publication of summary.publications) {
            if (seenAgentNames.has(publication.agentName)) {
                continue;
            }

            seenAgentNames.add(publication.agentName);
            agentNames.push(publication.agentName);
        }
    }

    return agentNames;
}

function writeDetailLine(
    context: Pick<CliExecutionContext, "stdout" | "translator">,
    label: string,
    values: string,
): void {
    writeLine(
        context.stdout,
        context.translator.t("skills.install.summary.detailLine", {
            label,
            values,
        }),
    );
}

function formatSkillNames(
    skillNames: readonly string[],
    colors: TerminalColors,
): string {
    return skillNames.map(skillName => colors.cyan(skillName)).join(", ");
}

function formatAgentNames(
    agentNames: readonly BundledSkillAgentName[],
    translator: ManagedSkillHostTranslator,
    colors: TerminalColors,
): string {
    return agentNames.map(agentName =>
        colors.cyan(readManagedSkillHostLabel(agentName, translator)),
    ).join(", ");
}
