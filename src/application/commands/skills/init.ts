import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { isFileAlreadyExistsError } from "../../shared/fs-errors.ts";
import { writeLine } from "../shared/output.ts";
import {
    removePath,
} from "./bundled-skill-filesystem.ts";
import { resolveRequestedManagedSkillHost } from "./check.ts";
import { writeLocalSkillMetadata } from "./local-skill-ownership.ts";
import {
    parseRequiredManagedSkillAgent,
} from "./managed-skill-agents.ts";
import {
    isPathWithinDirectory,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillsDirectoryPath,
} from "./managed-skill-paths.ts";
import { renderInitializedSkillMarkdown } from "./skill-authoring.ts";
import { normalizeSkillName } from "./skill-id.ts";

interface SkillsInitInput {
    agent?: string;
    description?: string;
    icon?: string;
    name: string;
    title?: string;
}

export const skillsInitCommand: CliCommandDefinition<SkillsInitInput> = {
    name: "init",
    summaryKey: "commands.skills.init.summary",
    descriptionKey: "commands.skills.init.description",
    arguments: [
        {
            name: "name",
            descriptionKey: "arguments.skill",
            required: true,
        },
    ],
    options: [
        {
            name: "agent",
            longFlag: "--agent",
            valueName: "agent",
            descriptionKey: "options.agent",
        },
        {
            name: "description",
            longFlag: "--description",
            valueName: "text",
            descriptionKey: "options.description",
        },
        {
            name: "icon",
            longFlag: "--icon",
            valueName: "icon",
            descriptionKey: "options.icon",
        },
        {
            name: "title",
            longFlag: "--title",
            valueName: "title",
            descriptionKey: "options.title",
        },
    ],
    inputSchema: z.object({
        agent: z.string().optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        name: z.string(),
        title: z.string().optional(),
    }),
    handler: async (input, context) => {
        await initializeLocalSkill(input, context);
    },
};

async function initializeLocalSkill(
    input: SkillsInitInput,
    context: CliExecutionContext,
): Promise<void> {
    const skillName = normalizeSkillName(input.name);
    const agentName = parseRequiredManagedSkillAgent(input.agent, {
        agentRequired: "errors.skills.init.agentRequired",
        invalidAgent: "errors.skills.init.invalidAgent",
    });

    if (skillName === "") {
        throw new CliUserError("errors.skills.init.invalidName", 1, {
            value: input.name,
        });
    }

    const description = input.description?.trim();
    const icon = input.icon?.trim();
    const title = input.title?.trim();

    if (description === undefined || description === "") {
        throw new CliUserError("errors.skills.init.descriptionRequired", 1);
    }

    if (input.icon !== undefined && icon === "") {
        throw new CliUserError("errors.skills.init.invalidIcon", 1);
    }

    if (input.title !== undefined && title === "") {
        throw new CliUserError("errors.skills.init.invalidTitle", 1);
    }

    const hosts = await resolveRequestedManagedSkillHost(
        context.env,
        context.translator,
        agentName,
    );
    const host = hosts[0]!;
    const skillDirectoryPath = resolveManagedSkillDirectoryPath(
        host.homeDirectory,
        skillName,
    );

    if (!isPathWithinAgentSkillsDirectory(host.homeDirectory, skillDirectoryPath)) {
        throw new CliUserError("errors.skills.invalidPath", 1, {
            name: skillName,
        });
    }

    let createdDirectory = false;

    try {
        const createdPath = await mkdir(skillDirectoryPath, { recursive: true });

        if (createdPath === undefined) {
            throw createLocalSkillInitTargetError(skillName, skillDirectoryPath);
        }

        createdDirectory = true;
        await Bun.write(
            join(skillDirectoryPath, "SKILL.md"),
            renderInitializedSkillMarkdown({
                description,
                icon,
                name: skillName,
                title,
            }),
        );
        await writeLocalSkillMetadata(skillDirectoryPath);

        writeLine(
            context.stdout,
            context.translator.t("skills.init.success", {
                name: skillName,
                path: skillDirectoryPath,
            }),
        );

        context.logger.info(
            {
                agentName,
                path: skillDirectoryPath,
                skillName,
            },
            "Local skill initialized.",
        );
    }
    catch (error) {
        if (isFileAlreadyExistsError(error)) {
            throw createLocalSkillInitTargetError(skillName, skillDirectoryPath);
        }

        if (createdDirectory) {
            await removePath(skillDirectoryPath);
        }

        throw error;
    }
}

function createLocalSkillInitTargetError(
    skillName: string,
    skillDirectoryPath: string,
): CliUserError {
    return new CliUserError("errors.skills.init.nameConflict", 1, {
        name: skillName,
        path: skillDirectoryPath,
    });
}

function isPathWithinAgentSkillsDirectory(
    homeDirectory: string,
    skillDirectoryPath: string,
): boolean {
    return isPathWithinDirectory(
        resolveManagedSkillsDirectoryPath(homeDirectory),
        skillDirectoryPath,
    );
}
