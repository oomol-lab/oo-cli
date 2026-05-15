import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";

import type { ManagedSkillHost } from "./managed-skill-hosts.ts";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { writeLine } from "../shared/output.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
import {
    codexSkillsDirectoryName,
} from "./bundled-skill-paths.ts";
import {
    createManagedSkillAgentNotInstalledError,
    createMissingRequiredSkillAgentError,
    parseManagedSkillAgentOption,
    resolveManagedSkillAgentHomeDirectory,
} from "./managed-skill-agents.ts";

interface SkillsCheckInput {
    agent?: string;
}

interface SkillsCheckResult {
    authoringRootDirectoryPath: string;
    hostCount: number;
}

export const skillsCheckCommand: CliCommandDefinition<SkillsCheckInput> = {
    name: "preflight",
    summaryKey: "commands.skills.check.summary",
    descriptionKey: "commands.skills.check.description",
    options: [
        {
            name: "agent",
            longFlag: "--agent",
            valueName: "agent",
            descriptionKey: "options.agent",
        },
    ],
    inputSchema: z.object({
        agent: z.string().optional(),
    }),
    handler: async (input, context) => {
        const agentName = parseRequiredSkillsCheckAgent(input.agent);
        const result = await checkLocalSkillAuthoringEnvironment(context, {
            agentName,
        });

        writeLine(
            context.stdout,
            context.translator.t("skills.check.success", {
                count: result.hostCount,
                path: result.authoringRootDirectoryPath,
            }),
        );
    },
};

export async function checkLocalSkillAuthoringEnvironment(
    context: Pick<CliExecutionContext, "env" | "translator">,
    options: {
        agentName: BundledSkillAgentName;
    },
): Promise<SkillsCheckResult> {
    const hosts = await resolveRequestedManagedSkillHost(
        context.env,
        context.translator,
        options.agentName,
    );
    const authoringRootDirectoryPath = resolveManagedSkillHostPublishRoot(
        hosts[0]!,
    );

    await verifyWritableDirectory(authoringRootDirectoryPath);

    return {
        authoringRootDirectoryPath,
        hostCount: hosts.length,
    };
}

export async function resolveRequestedManagedSkillHost(
    env: Record<string, string | undefined>,
    translator: Pick<CliExecutionContext["translator"], "t">,
    agentName: BundledSkillAgentName,
): Promise<Array<{ agentName: BundledSkillAgentName; homeDirectory: string }>> {
    const homeDirectory = resolveManagedSkillAgentHomeDirectory(env, agentName);

    if (!(await directoryExists(homeDirectory))) {
        throw createManagedSkillAgentNotInstalledError(
            agentName,
            homeDirectory,
            translator,
        );
    }

    return [
        {
            agentName,
            homeDirectory,
        },
    ];
}

function resolveManagedSkillHostPublishRoot(host: ManagedSkillHost): string {
    return join(host.homeDirectory, codexSkillsDirectoryName);
}

function parseRequiredSkillsCheckAgent(
    value: string | undefined,
): BundledSkillAgentName {
    if (value === undefined) {
        throw createMissingRequiredSkillAgentError("errors.skills.check.agentRequired");
    }

    const agentName = parseManagedSkillAgentOption(
        value,
        "errors.skills.check.invalidAgent",
    );

    if (agentName === undefined) {
        throw createMissingRequiredSkillAgentError("errors.skills.check.agentRequired");
    }

    return agentName;
}

async function verifyWritableDirectory(directoryPath: string): Promise<void> {
    const probeFilePath = join(
        directoryPath,
        `.oo-skills-check-${Bun.randomUUIDv7()}`,
    );

    try {
        await mkdir(directoryPath, { recursive: true });
        await Bun.write(probeFilePath, "ok");
    }
    catch (error) {
        throw new CliUserError("errors.skills.check.storageNotWritable", 1, {
            message: error instanceof Error ? error.message : String(error),
            path: directoryPath,
        });
    }
    finally {
        try {
            await rm(probeFilePath, { force: true });
        }
        catch {
            // Preserve the original readiness error when cleanup probes invalid paths.
        }
    }
}
