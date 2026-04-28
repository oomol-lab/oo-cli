import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";

import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { writeLine } from "../shared/output.ts";
import { directoryExists } from "./bundled-skill-observation.ts";
import { resolveBundledSkillHomeDirectory } from "./bundled-skill-paths.ts";
import { availableBundledSkillAgentNames } from "./embedded-assets.ts";
import {
    createMissingManagedSkillHostError,
    resolveAvailableManagedSkillHosts,
} from "./managed-skill-hosts.ts";
import { resolveLocalSkillCanonicalRootDirectoryPath } from "./managed-skill-paths.ts";

interface SkillsCheckInput {
    agent?: BundledSkillAgentName;
}

interface SkillsCheckResult {
    canonicalRootDirectoryPath: string;
    hostCount: number;
}

export const skillsCheckCommand: CliCommandDefinition<SkillsCheckInput> = {
    name: "check",
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
        agent: z.enum(availableBundledSkillAgentNames).optional(),
    }),
    handler: async (input, context) => {
        const result = await checkLocalSkillAuthoringEnvironment(context, {
            agentName: input.agent,
        });

        writeLine(
            context.stdout,
            context.translator.t("skills.check.success", {
                count: result.hostCount,
                path: result.canonicalRootDirectoryPath,
            }),
        );
    },
};

export async function checkLocalSkillAuthoringEnvironment(
    context: Pick<CliExecutionContext, "env" | "settingsStore">,
    options: {
        agentName?: BundledSkillAgentName;
    } = {},
): Promise<SkillsCheckResult> {
    const hosts = options.agentName === undefined
        ? await resolveAvailableManagedSkillHosts(context.env)
        : await resolveRequestedManagedSkillHost(context.env, options.agentName);

    if (hosts.length === 0) {
        throw createMissingManagedSkillHostError(context.env);
    }

    const canonicalRootDirectoryPath = resolveLocalSkillCanonicalRootDirectoryPath(
        context.settingsStore.getFilePath(),
    );

    await verifyWritableDirectory(canonicalRootDirectoryPath);

    return {
        canonicalRootDirectoryPath,
        hostCount: hosts.length,
    };
}

async function resolveRequestedManagedSkillHost(
    env: Record<string, string | undefined>,
    agentName: BundledSkillAgentName,
): Promise<Array<{ agentName: BundledSkillAgentName; homeDirectory: string }>> {
    const homeDirectory = resolveBundledSkillHomeDirectory(env, agentName);

    if (!(await directoryExists(homeDirectory))) {
        throw createMissingRequestedManagedSkillHostError(agentName, homeDirectory);
    }

    return [
        {
            agentName,
            homeDirectory,
        },
    ];
}

function createMissingRequestedManagedSkillHostError(
    agentName: BundledSkillAgentName,
    homeDirectory: string,
): CliUserError {
    return new CliUserError(
        resolveManagedSkillHostMissingErrorKey(agentName),
        1,
        {
            path: homeDirectory,
        },
    );
}

function resolveManagedSkillHostMissingErrorKey(
    agentName: BundledSkillAgentName,
): "errors.skills.claudeNotInstalled" | "errors.skills.codexNotInstalled" | "errors.skills.openclawNotInstalled" {
    switch (agentName) {
        case "claude":
            return "errors.skills.claudeNotInstalled";
        case "codex":
            return "errors.skills.codexNotInstalled";
        case "openclaw":
            return "errors.skills.openclawNotInstalled";
    }
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
        await rm(probeFilePath, { force: true });
    }
}
