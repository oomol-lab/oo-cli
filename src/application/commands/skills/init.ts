import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";

import type { BundledSkillAgentName } from "./embedded-assets.ts";
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
    createMissingRequiredSkillAgentError,
    parseManagedSkillAgentOption,
} from "./managed-skill-agents.ts";
import {
    isPathWithinDirectory,
    resolveManagedSkillDirectoryPath,
    resolveManagedSkillsDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    installedRegistrySkillCompatibility,
    renderOoPackageExecutionGuidance,
} from "./registry-skill-markdown.ts";
import { stringifySkillMarkdownMatter } from "./skill-frontmatter.ts";
import { renderSkillTitle } from "./skill-title.ts";

interface SkillsInitInput {
    agent?: string;
    description?: string;
    icon?: string;
    name: string;
    title?: string;
}

interface OOSkillFrontmatter {
    compatibility: string;
    description: string;
    metadata?: OOSkillFrontmatterMetadata;
    name: string;
}

interface OOSkillFrontmatterMetadata {
    icon?: string;
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
    const agentName = parseRequiredSkillsInitAgent(input.agent);

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
            renderInitializedSkillMarkdown(skillName, description, icon, title),
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

function parseRequiredSkillsInitAgent(
    value: string | undefined,
): BundledSkillAgentName {
    if (value === undefined) {
        throw createMissingRequiredSkillAgentError("errors.skills.init.agentRequired");
    }

    const agentName = parseManagedSkillAgentOption(
        value,
        "errors.skills.init.invalidAgent",
    );

    if (agentName === undefined) {
        throw createMissingRequiredSkillAgentError("errors.skills.init.agentRequired");
    }

    return agentName;
}

function createLocalSkillInitTargetError(
    skillName: string,
    skillDirectoryPath: string,
): CliUserError {
    return new CliUserError("errors.skills.nameConflict", 1, {
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

function renderInitializedSkillMarkdown(
    skillName: string,
    description: string,
    icon: string | undefined,
    title: string | undefined,
): string {
    const frontmatter: OOSkillFrontmatter = {
        name: skillName,
        description,
        compatibility: installedRegistrySkillCompatibility,
    };

    if (icon !== undefined || title !== undefined) {
        frontmatter.metadata = {};

        if (icon !== undefined) {
            frontmatter.metadata.icon = icon;
        }

        if (title !== undefined) {
            frontmatter.metadata.title = title;
        }
    }

    const body = [
        "",
        `# ${title ?? renderSkillTitle(skillName)}`,
        "",
        renderOoPackageExecutionGuidance(),
        "",
        "## When to Use",
        "",
        "TODO: Describe the user requests and outcomes that should trigger this skill.",
        "",
        "## Inputs",
        "",
        "- TODO: List required user inputs.",
        "- TODO: List optional inputs or safe defaults.",
        "",
        "## Execution",
        "",
        "TODO: Describe the exact oo package/block or connector command path.",
        "",
        "## Result Handling",
        "",
        "TODO: Describe useful output fields, artifacts, previews, or saved files.",
        "",
        "## Failure Handling",
        "",
        "TODO: Describe auth, billing, missing input, unsupported shape, timeout, or task failure blockers.",
        "",
    ].join("\n");

    return stringifySkillMarkdownMatter(body, frontmatter);
}

function normalizeSkillName(value: string): string {
    const normalizedCharacters: string[] = [];
    let previousWasHyphen = false;

    for (const char of value.trim().toLowerCase()) {
        if (isLowercaseAsciiLetter(char) || isAsciiDigit(char)) {
            normalizedCharacters.push(char);
            previousWasHyphen = false;
            continue;
        }

        if (!previousWasHyphen && normalizedCharacters.length > 0) {
            normalizedCharacters.push("-");
            previousWasHyphen = true;
        }
    }

    if (normalizedCharacters.at(-1) === "-") {
        normalizedCharacters.pop();
    }

    let result = normalizedCharacters.join("").slice(0, 64);

    while (result.endsWith("-")) {
        result = result.slice(0, -1);
    }

    return result;
}

function isLowercaseAsciiLetter(char: string): boolean {
    return char >= "a" && char <= "z";
}

function isAsciiDigit(char: string): boolean {
    return char >= "0" && char <= "9";
}
