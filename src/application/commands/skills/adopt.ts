import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import type { BundledSkillAgentName } from "./embedded-assets.ts";
import { cp, mkdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { writeLine } from "../shared/output.ts";
import {
    isNodeNotFoundError,
    removePath,
} from "./bundled-skill-filesystem.ts";
import { resolveRequestedManagedSkillHost } from "./check.ts";
import {
    isForeignManagedMetadataState,
    readSkillFileContent,
    readSkillMetadataFileState,
    writeLocalSkillMetadata,
} from "./local-skill-ownership.ts";
import {
    createMissingRequiredSkillAgentError,
    parseManagedSkillAgentOption,
} from "./managed-skill-agents.ts";
import {
    isPathWithinDirectory,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillsDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    readSkillFrontmatterName,
    writeAdoptedSkillContract,
} from "./skill-authoring.ts";
import { normalizeSkillName } from "./skill-id.ts";
import { validateSkillDirectory } from "./validate.ts";

interface SkillsAdoptInput {
    agent?: string;
    description?: string;
    icon?: string;
    name?: string;
    path: string;
    title?: string;
}

export const skillsAdoptCommand: CliCommandDefinition<SkillsAdoptInput> = {
    name: "adopt",
    summaryKey: "commands.skills.adopt.summary",
    descriptionKey: "commands.skills.adopt.description",
    arguments: [
        {
            name: "path",
            descriptionKey: "arguments.filePath",
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
            name: "name",
            longFlag: "--name",
            valueName: "name",
            descriptionKey: "options.skills.adopt.name",
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
        name: z.string().optional(),
        path: z.string(),
        title: z.string().optional(),
    }),
    handler: async (input, context) => {
        await adoptLocalSkill(input, context);
    },
};

async function adoptLocalSkill(
    input: SkillsAdoptInput,
    context: CliExecutionContext,
): Promise<void> {
    const sourceDirectoryPath = resolve(context.cwd, input.path);

    await validateAdoptSourceDirectory(sourceDirectoryPath);

    const sourceSkillFileContent = await readSkillFileContent(sourceDirectoryPath);
    const skillName = normalizeAdoptedSkillName({
        name: input.name,
        sourceDirectoryPath,
        sourceSkillFileContent,
    });
    const description = input.description?.trim();
    const icon = input.icon?.trim();
    const title = input.title?.trim();

    if (description !== undefined && description === "") {
        throw new CliUserError("errors.skills.adopt.invalidDescription", 1);
    }

    if (input.icon !== undefined && icon === "") {
        throw new CliUserError("errors.skills.init.invalidIcon", 1);
    }

    if (input.title !== undefined && title === "") {
        throw new CliUserError("errors.skills.init.invalidTitle", 1);
    }

    await validateAdoptMetadata(sourceDirectoryPath);

    const targetDirectoryPath = await prepareAdoptTargetDirectory({
        agent: input.agent,
        context,
        skillName,
        sourceDirectoryPath,
    });

    await writeAdoptedSkillContract(targetDirectoryPath, {
        description,
        icon,
        name: skillName,
        title,
    });
    await writeLocalSkillMetadata(targetDirectoryPath);
    await validateAdoptedSkillDirectory(targetDirectoryPath, context);

    writeLine(
        context.stdout,
        context.translator.t("skills.adopt.success", {
            name: skillName,
            path: targetDirectoryPath,
        }),
    );

    context.logger.info(
        {
            path: targetDirectoryPath,
            skillName,
            sourcePath: sourceDirectoryPath,
        },
        "Existing local workflow adopted as a skill.",
    );
}

async function validateAdoptSourceDirectory(
    sourceDirectoryPath: string,
): Promise<void> {
    let sourceStats: Awaited<ReturnType<typeof stat>>;

    try {
        sourceStats = await stat(sourceDirectoryPath);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            throw new CliUserError("errors.skills.adopt.pathMissing", 1, {
                path: sourceDirectoryPath,
            });
        }

        throw error;
    }

    if (!sourceStats.isDirectory()) {
        throw new CliUserError("errors.skills.adopt.pathNotDirectory", 1, {
            path: sourceDirectoryPath,
        });
    }
}

function normalizeAdoptedSkillName(options: {
    name: string | undefined;
    sourceDirectoryPath: string;
    sourceSkillFileContent: string | undefined;
}): string {
    const skillName = normalizeSkillName(
        options.name
        ?? readSkillFrontmatterName(options.sourceSkillFileContent)
        ?? basename(options.sourceDirectoryPath),
    );

    if (skillName === "") {
        throw new CliUserError("errors.skills.adopt.invalidName", 1, {
            value: options.name ?? basename(options.sourceDirectoryPath),
        });
    }

    return skillName;
}

async function prepareAdoptTargetDirectory(options: {
    agent: string | undefined;
    context: CliExecutionContext;
    skillName: string;
    sourceDirectoryPath: string;
}): Promise<string> {
    if (options.agent === undefined) {
        return options.sourceDirectoryPath;
    }

    const agentName = parseOptionalSkillsAdoptAgent(options.agent);
    const hosts = await resolveRequestedManagedSkillHost(
        options.context.env,
        options.context.translator,
        agentName,
    );
    const host = hosts[0]!;
    const targetDirectoryPath = resolveManagedSkillDirectoryPath(
        host.homeDirectory,
        options.skillName,
    );

    if (!isPathWithinDirectory(
        resolveManagedSkillsDirectoryPath(host.homeDirectory),
        targetDirectoryPath,
    )) {
        throw new CliUserError("errors.skills.invalidPath", 1, {
            name: options.skillName,
        });
    }

    if (await areSamePath(options.sourceDirectoryPath, targetDirectoryPath)) {
        return targetDirectoryPath;
    }

    await copyAdoptSourceToTarget({
        skillName: options.skillName,
        sourceDirectoryPath: options.sourceDirectoryPath,
        targetDirectoryPath,
    });

    return targetDirectoryPath;
}

function parseOptionalSkillsAdoptAgent(value: string): BundledSkillAgentName {
    const agentName = parseManagedSkillAgentOption(
        value,
        "errors.skills.adopt.invalidAgent",
    );

    if (agentName === undefined) {
        throw createMissingRequiredSkillAgentError("errors.skills.adopt.invalidAgent");
    }

    return agentName;
}

async function copyAdoptSourceToTarget(options: {
    skillName: string;
    sourceDirectoryPath: string;
    targetDirectoryPath: string;
}): Promise<void> {
    await rejectExistingAdoptTarget(options.skillName, options.targetDirectoryPath);
    await mkdir(dirname(options.targetDirectoryPath), { recursive: true });

    try {
        await cp(options.sourceDirectoryPath, options.targetDirectoryPath, {
            dereference: true,
            errorOnExist: true,
            force: false,
            recursive: true,
        });
    }
    catch (error) {
        if (isCopyTargetAlreadyExistsError(error)) {
            throw new CliUserError("errors.skills.nameConflict", 1, {
                name: options.skillName,
                path: options.targetDirectoryPath,
            });
        }

        await removePath(options.targetDirectoryPath);
        throw error;
    }
}

async function rejectExistingAdoptTarget(
    skillName: string,
    targetDirectoryPath: string,
): Promise<void> {
    try {
        await stat(targetDirectoryPath);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return;
        }

        throw error;
    }

    throw new CliUserError("errors.skills.nameConflict", 1, {
        name: skillName,
        path: targetDirectoryPath,
    });
}

function isCopyTargetAlreadyExistsError(
    error: unknown,
): error is NodeJS.ErrnoException {
    return error instanceof Error
        && "code" in error
        && (error.code === "EEXIST" || error.code === "ERR_FS_CP_EEXIST");
}

async function validateAdoptMetadata(
    skillDirectoryPath: string,
): Promise<void> {
    const metadataState = await readSkillMetadataFileState(skillDirectoryPath);

    if (!isForeignManagedMetadataState(metadataState)) {
        return;
    }

    throw new CliUserError("errors.skills.adopt.foreignMetadata", 1, {
        path: skillDirectoryPath,
    });
}

async function validateAdoptedSkillDirectory(
    skillDirectoryPath: string,
    context: CliExecutionContext,
): Promise<void> {
    const result = await validateSkillDirectory(skillDirectoryPath);

    if (result.error !== undefined) {
        throw new CliUserError("errors.skills.validate.failed", 1, {
            message: result.error,
        });
    }

    for (const warning of result.warnings ?? []) {
        writeLine(context.stderr, warning);
    }
}

async function areSamePath(
    leftPath: string,
    rightPath: string,
): Promise<boolean> {
    if (resolve(leftPath) === resolve(rightPath)) {
        return true;
    }

    try {
        return await realpath(leftPath) === await realpath(rightPath);
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
}
