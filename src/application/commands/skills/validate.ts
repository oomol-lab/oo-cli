import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
    isDefined,
    isNonEmptyString,
    isPlainObject,
    isString,
} from "@wopjs/cast";
import matter from "gray-matter";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { writeLine } from "../shared/output.ts";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";

interface SkillsValidateInput {
    path: string;
}

interface SkillValidationResult {
    error?: string;
    warnings?: string[];
}

interface ParsedFrontmatter {
    description: unknown;
    metadataIcon: unknown;
    metadataTitle: unknown;
    name: unknown;
}

export const skillsValidateCommand: CliCommandDefinition<SkillsValidateInput> = {
    name: "validate",
    summaryKey: "commands.skills.validate.summary",
    descriptionKey: "commands.skills.validate.description",
    arguments: [
        {
            name: "path",
            descriptionKey: "arguments.filePath",
            required: true,
        },
    ],
    inputSchema: z.object({
        path: z.string(),
    }),
    handler: async (input, context) => {
        const skillDirectoryPath = resolve(context.cwd, input.path);
        const result = await validateSkillDirectory(skillDirectoryPath);

        if (result.error !== undefined) {
            throw new CliUserError("errors.skills.validate.failed", 1, {
                message: result.error,
            });
        }

        for (const warning of result.warnings ?? []) {
            writeLine(context.stderr, warning);
        }

        writeLine(
            context.stdout,
            context.translator.t("skills.validate.success", {
                path: skillDirectoryPath,
            }),
        );
    },
};

export async function validateSkillDirectory(
    skillDirectoryPath: string,
): Promise<SkillValidationResult> {
    let content: string;

    try {
        content = await readFile(join(skillDirectoryPath, "SKILL.md"), "utf8");
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return {
                error: "SKILL.md does not exist.",
            };
        }

        throw error;
    }

    const frontmatter = parseSkillFrontmatter(content);

    if (isString(frontmatter)) {
        return {
            error: frontmatter,
        };
    }

    const name = frontmatter.name;

    if (!isNonEmptyString(name)) {
        return {
            error: "Frontmatter must include a string name field.",
        };
    }

    const nameError = validateSkillNameValue(name);

    if (isDefined(nameError)) {
        return {
            error: nameError,
        };
    }

    const description = frontmatter.description;

    if (!isNonBlankString(description)) {
        return {
            error: "Frontmatter must include a string description field.",
        };
    }

    const icon = frontmatter.metadataIcon;

    const iconError = validateSkillIconValue(icon);

    if (isDefined(iconError)) {
        return {
            error: iconError,
        };
    }

    const title = frontmatter.metadataTitle;

    const titleError = validateSkillTitleValue(title);

    if (isDefined(titleError)) {
        return {
            error: titleError,
        };
    }

    const warnings = readSkillFrontmatterWarnings(frontmatter);

    if (warnings.length > 0) {
        return { warnings };
    }

    return {};
}

function parseSkillFrontmatter(content: string): ParsedFrontmatter | string {
    let parsedMatter: matter.GrayMatterFile<string>;

    try {
        parsedMatter = matter(content);
    }
    catch {
        return "Frontmatter must be a YAML dictionary.";
    }

    if (!isPlainObject(parsedMatter.data)) {
        return "Frontmatter must be a YAML dictionary.";
    }

    const metadata = parsedMatter.data.metadata;

    if (metadata !== undefined && !isPlainObject(metadata)) {
        return "Frontmatter metadata must be an object.";
    }

    return {
        description: parsedMatter.data.description,
        metadataIcon: metadata?.icon,
        metadataTitle: metadata?.title,
        name: parsedMatter.data.name,
    };
}

function validateSkillNameValue(name: string): string | undefined {
    if (name === "") {
        return "Frontmatter name cannot be empty.";
    }

    return undefined;
}

function validateSkillIconValue(icon: unknown): string | undefined {
    if (icon === undefined) {
        return;
    }

    if (!isNonBlankString(icon)) {
        return "Frontmatter metadata.icon must be a non-empty string.";
    }
}

function validateSkillTitleValue(title: unknown): string | undefined {
    if (title === undefined) {
        return;
    }

    if (!isString(title)) {
        return "Frontmatter metadata.title must be a string.";
    }

    if (!isNonBlankString(title)) {
        return "Frontmatter metadata.title cannot be empty.";
    }
}

function isNonBlankString(value: unknown): value is string {
    return isNonEmptyString(value) && value.trim() !== "";
}

function readSkillFrontmatterWarnings(
    frontmatter: ParsedFrontmatter,
): string[] {
    const warnings: string[] = [];

    if (!isNonEmptyString(frontmatter.metadataIcon)) {
        warnings.push("Warning: Frontmatter metadata.icon is missing.");
    }

    if (!isNonEmptyString(frontmatter.metadataTitle)) {
        warnings.push("Warning: Frontmatter metadata.title is missing.");
    }

    return warnings;
}
