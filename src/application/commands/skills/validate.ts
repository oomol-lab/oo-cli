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
import { isNonBlankString } from "./skill-frontmatter.ts";

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

    return (
        validateRequiredField(frontmatter.name, "name")
        || validateRequiredField(frontmatter.description, "description")
        || validateOptionalField(frontmatter.metadataIcon, "metadata.icon")
        || validateOptionalField(frontmatter.metadataTitle, "metadata.title")
        || readSkillFrontmatterWarnings(frontmatter)
        || {}
    );
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

    if (isDefined(metadata) && !isPlainObject(metadata)) {
        return "Frontmatter metadata must be an object.";
    }

    return {
        description: parsedMatter.data.description,
        metadataIcon: metadata?.icon,
        metadataTitle: metadata?.title,
        name: parsedMatter.data.name,
    };
}

function validateRequiredField(
    fieldValue: unknown,
    fieldName: string,
): { error: string } | undefined {
    if (!isNonBlankString(fieldValue)) {
        return {
            error: `Frontmatter must include a non-empty string ${fieldName} field.`,
        };
    }
}

function validateOptionalField(
    fieldValue: unknown,
    fieldName: string,
): { error: string } | undefined {
    if (isDefined(fieldValue) && !isNonBlankString(fieldValue)) {
        return {
            error: `Frontmatter ${fieldName} field must be a non-empty string if provided.`,
        };
    }
}

function readSkillFrontmatterWarnings(
    frontmatter: ParsedFrontmatter,
): { warnings: string[] } | undefined {
    let warnings: string[] | undefined;

    if (!isNonEmptyString(frontmatter.metadataIcon)) {
        (warnings ??= []).push(
            "Warning: Frontmatter metadata.icon is missing.",
        );
    }

    if (!isNonEmptyString(frontmatter.metadataTitle)) {
        (warnings ??= []).push(
            "Warning: Frontmatter metadata.title is missing.",
        );
    }

    return warnings && { warnings };
}
