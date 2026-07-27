import type { CliCommandDefinition, CliExecutionContext, Writer } from "../contracts/cli.ts";
import type { TerminalColors } from "../terminal-colors.ts";
import type { BundledSkillAgentName } from "./skills/managed-skill-agents.ts";

import process from "node:process";
import { z } from "zod";
import { resolveStorePaths } from "../../adapters/store/store-path.ts";
import { APP_NAME } from "../config/app-config.ts";
import { createWriterColors } from "../terminal-colors.ts";
import { directoryExists } from "./skills/bundled-skill-observation.ts";
import {
    availableBundledSkillAgentNames,
    resolveManagedSkillAgentHomeDirectory,
} from "./skills/managed-skill-agents.ts";
import { resolveManagedSkillsDirectoryPath } from "./skills/managed-skill-paths.ts";

type InfoAgentStatus = "available" | "no_skills" | "not_installed";

const infoAgentStatusOrder: Record<InfoAgentStatus, number> = {
    available: 0,
    no_skills: 1,
    not_installed: 2,
};

export interface InfoAgentEntry {
    id: BundledSkillAgentName;
    skillDir: string;
    status: InfoAgentStatus;
}

export type { InfoAgentStatus };

interface InfoOutput {
    cli: {
        version: string;
        platform: string;
        arch: string;
        storeDir: string;
        logDir: string;
        authFile: string;
        settingsFile: string;
    };
    agents: readonly InfoAgentEntry[];
    features: readonly string[];
}

export const infoCommand: CliCommandDefinition = {
    name: "info",
    summaryKey: "commands.info.summary",
    descriptionKey: "commands.info.description",
    output: "standard",
    inputSchema: z.object({}),
    handler: async (_input, context) => {
        const info = await collectInfo(context);

        context.output.emit(info, () => writeInfoAsText(info, context));
    },
};

async function collectInfo(
    context: CliExecutionContext,
): Promise<InfoOutput> {
    const storePaths = resolveStorePaths({
        appName: APP_NAME,
        env: context.env,
        platform: process.platform,
    });
    const agents = await collectAgents(context.env);

    return {
        cli: {
            version: context.version,
            platform: process.platform,
            arch: process.arch,
            storeDir: storePaths.rootDirectory,
            logDir: storePaths.logDirectoryPath,
            authFile: context.authStore.getFilePath(),
            settingsFile: context.settingsStore.getFilePath(),
        },
        agents,
        features: [],
    };
}

export async function collectAgents(
    env: Record<string, string | undefined>,
): Promise<readonly InfoAgentEntry[]> {
    return await Promise.all(
        availableBundledSkillAgentNames.map(async (agentName) => {
            const homeDirectory = resolveManagedSkillAgentHomeDirectory(env, agentName);
            const skillDir = resolveManagedSkillsDirectoryPath(homeDirectory);
            const status = await resolveAgentStatus(homeDirectory, skillDir);

            return {
                id: agentName,
                skillDir,
                status,
            } satisfies InfoAgentEntry;
        }),
    );
}

async function resolveAgentStatus(
    homeDirectory: string,
    skillDir: string,
): Promise<InfoAgentStatus> {
    const [homeExists, skillDirExists] = await Promise.all([
        directoryExists(homeDirectory),
        directoryExists(skillDir),
    ]);

    if (!homeExists) {
        return "not_installed";
    }

    return skillDirExists ? "available" : "no_skills";
}

function writeInfoAsText(
    info: InfoOutput,
    context: CliExecutionContext,
): void {
    const colors = createWriterColors(context.stdout);
    const writer = context.stdout;
    const translate = (key: string): string => context.translator.t(key);

    writeSectionHeading(writer, colors, translate("info.section.cli"));
    writeKeyValue(writer, colors, translate("info.cli.version"), info.cli.version);
    writeKeyValue(writer, colors, translate("info.cli.platform"), info.cli.platform);
    writeKeyValue(writer, colors, translate("info.cli.arch"), info.cli.arch);
    writeKeyValue(writer, colors, translate("info.cli.storeDir"), info.cli.storeDir);
    writeKeyValue(writer, colors, translate("info.cli.logDir"), info.cli.logDir);
    writeKeyValue(writer, colors, translate("info.cli.authFile"), info.cli.authFile);
    writeKeyValue(writer, colors, translate("info.cli.settingsFile"), info.cli.settingsFile);

    writer.write("\n");
    writeSectionHeading(writer, colors, translate("info.section.agents"));

    if (info.agents.length === 0) {
        writer.write(`  ${colors.dim(translate("info.agents.empty"))}\n`);
    }
    else {
        for (const agent of sortAgentsForText(info.agents)) {
            writeAgentEntry(writer, colors, agent, translate);
        }
    }

    writer.write("\n");
    writeSectionHeading(writer, colors, translate("info.section.features"));

    if (info.features.length === 0) {
        writer.write(`  ${colors.dim(translate("info.features.empty"))}\n`);
    }
    else {
        for (const feature of info.features) {
            writer.write(`  ${colors.dim("-")} ${feature}\n`);
        }
    }
}

function sortAgentsForText(
    agents: readonly InfoAgentEntry[],
): readonly InfoAgentEntry[] {
    // Stable sort by readiness: available → no_skills → not_installed, keeping
    // the catalog-registered order within each group.
    return Array.from(agents, (agent, index) => ({ agent, index }))
        .sort((left, right) => {
            const delta
                = infoAgentStatusOrder[left.agent.status]
                    - infoAgentStatusOrder[right.agent.status];

            return delta !== 0 ? delta : left.index - right.index;
        })
        .map(entry => entry.agent);
}

function writeSectionHeading(
    writer: Writer,
    colors: TerminalColors,
    label: string,
): void {
    writer.write(`${colors.bold(label)}\n`);
}

function writeKeyValue(
    writer: Writer,
    colors: TerminalColors,
    label: string,
    value: string,
): void {
    writer.write(`  ${colors.dim(`${label}:`)} ${value}\n`);
}

function formatAgentStatus(
    status: InfoAgentStatus,
    label: string,
    colors: TerminalColors,
): string {
    switch (status) {
        case "available":
            return colors.green(label);
        case "no_skills":
            return colors.yellow(label);
        case "not_installed":
            return colors.dim(label);
    }
}

function writeAgentEntry(
    writer: Writer,
    colors: TerminalColors,
    agent: InfoAgentEntry,
    translate: (key: string) => string,
): void {
    const statusLabel = translate(`info.agents.status.${agent.status}`);
    const statusFormatted = formatAgentStatus(agent.status, statusLabel, colors);

    writer.write(
        `  ${colors.bold(agent.id)} ${colors.dim("(")}${statusFormatted}${colors.dim(")")}\n`,
    );
    writer.write(
        `    ${colors.dim(`${translate("info.agents.skillDir")}:`)} ${agent.skillDir}\n`,
    );
}
