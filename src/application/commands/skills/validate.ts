import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
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

    if (typeof frontmatter === "string") {
        return {
            error: frontmatter,
        };
    }

    const name = frontmatter.name;

    if (typeof name !== "string") {
        return {
            error: "Frontmatter must include a string name field.",
        };
    }

    const nameError = validateSkillNameValue(name);

    if (nameError !== undefined) {
        return {
            error: nameError,
        };
    }

    const description = frontmatter.description;

    if (typeof description !== "string") {
        return {
            error: "Frontmatter must include a string description field.",
        };
    }

    const title = frontmatter.metadataTitle;

    const titleError = validateSkillTitleValue(title);

    if (titleError !== undefined) {
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

    if (!isRecord(parsedMatter.data)) {
        return "Frontmatter must be a YAML dictionary.";
    }

    const metadata = parsedMatter.data.metadata;

    return {
        description: parsedMatter.data.description,
        metadataIcon: isRecord(metadata) ? metadata.icon : undefined,
        metadataTitle: isRecord(metadata) ? metadata.title : undefined,
        name: parsedMatter.data.name,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSkillNameValue(name: string): string | undefined {
    if (name === "") {
        return "Frontmatter name cannot be empty.";
    }

    return undefined;
}

function validateSkillTitleValue(title: unknown): string | undefined {
    if (title === undefined) {
        return undefined;
    }

    if (typeof title !== "string") {
        return "Frontmatter metadata.title must be a string.";
    }

    if (title === "") {
        return "Frontmatter metadata.title cannot be empty.";
    }

    return undefined;
}

function readSkillFrontmatterWarnings(frontmatter: ParsedFrontmatter): string[] {
    const warnings: string[] = [];

    if (frontmatter.metadataIcon === undefined) {
        warnings.push("Warning: Frontmatter metadata.icon is missing.");
    }

    if (frontmatter.metadataTitle === undefined) {
        warnings.push("Warning: Frontmatter metadata.title is missing.");
    }

    return warnings;
}
