import type { CliCommandDefinition } from "../../contracts/cli.ts";

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { writeLine } from "../shared/output.ts";
import { isNodeNotFoundError } from "./bundled-skill-filesystem.ts";

interface SkillsValidateInput {
    path: string;
}

interface SkillValidationResult {
    error?: string;
}

interface ParsedFrontmatter {
    fields: Map<string, string | undefined>;
}

const supportedFrontmatterKeys = [
    "allowed-tools",
    "description",
    "license",
    "metadata",
    "name",
] as const;

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

    for (const key of frontmatter.fields.keys()) {
        if (!supportedFrontmatterKeys.includes(key as typeof supportedFrontmatterKeys[number])) {
            return {
                error: `Unsupported frontmatter key: ${key}.`,
            };
        }
    }

    const name = frontmatter.fields.get("name");

    if (name === undefined) {
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

    const description = frontmatter.fields.get("description");

    if (description === undefined) {
        return {
            error: "Frontmatter must include a string description field.",
        };
    }

    const descriptionError = validateSkillDescriptionValue(description);

    if (descriptionError !== undefined) {
        return {
            error: descriptionError,
        };
    }

    return {};
}

function parseSkillFrontmatter(content: string): ParsedFrontmatter | string {
    const normalizedContent = content
        .replaceAll("\r\n", "\n")
        .replaceAll("\r", "\n");
    const lines = normalizedContent.split("\n");

    if (lines[0] !== "---") {
        return "SKILL.md must start with YAML frontmatter delimited by ---.";
    }

    let endIndex = 1;

    while (endIndex < lines.length && lines[endIndex] !== "---") {
        endIndex += 1;
    }

    if (endIndex >= lines.length) {
        return "Frontmatter must end with a --- delimiter.";
    }

    const fields = new Map<string, string | undefined>();
    const frontmatterLines = lines.slice(1, endIndex);
    let currentBlockKey: string | undefined;
    let currentBlockLines: string[] = [];

    for (const line of frontmatterLines) {
        const topLevelField = readTopLevelFrontmatterField(line);

        if (topLevelField === undefined) {
            if (currentBlockKey !== undefined && isIndentedLine(line)) {
                currentBlockLines.push(line.trim());
                continue;
            }

            if (line.trim() === "") {
                continue;
            }

            return "Frontmatter must be a YAML dictionary.";
        }

        if (currentBlockKey !== undefined) {
            fields.set(currentBlockKey, currentBlockLines.join(" ").trim());
            currentBlockKey = undefined;
            currentBlockLines = [];
        }

        if (fields.has(topLevelField.key)) {
            return `Duplicate frontmatter key: ${topLevelField.key}.`;
        }

        const parsedValue = parseYamlScalar(topLevelField.value);

        if (parsedValue === "block" || topLevelField.value === "") {
            currentBlockKey = topLevelField.key;
            currentBlockLines = [];
            continue;
        }

        fields.set(topLevelField.key, parsedValue);
    }

    if (currentBlockKey !== undefined) {
        fields.set(currentBlockKey, currentBlockLines.join(" ").trim());
    }

    return {
        fields,
    };
}

function readTopLevelFrontmatterField(
    line: string,
): { key: string; value: string } | undefined {
    if (isIndentedLine(line)) {
        return undefined;
    }

    const separatorIndex = line.indexOf(":");

    if (separatorIndex <= 0) {
        return undefined;
    }

    return {
        key: line.slice(0, separatorIndex).trim(),
        value: line.slice(separatorIndex + 1).trim(),
    };
}

function isIndentedLine(line: string): boolean {
    return line.startsWith(" ") || line.startsWith("\t");
}

function parseYamlScalar(value: string): string | undefined | "block" {
    if (value === "") {
        return undefined;
    }

    if (value === ">" || value === ">-" || value === "|" || value === "|-") {
        return "block";
    }

    if (value.startsWith("\"") && value.endsWith("\"")) {
        try {
            const parsedValue: unknown = JSON.parse(value);

            return typeof parsedValue === "string" ? parsedValue : undefined;
        }
        catch {
            return undefined;
        }
    }

    if (value.startsWith("'") && value.endsWith("'")) {
        return value.slice(1, -1).replaceAll("''", "'");
    }

    if (value.startsWith("[") || value.startsWith("{")) {
        return undefined;
    }

    return value;
}

function validateSkillNameValue(name: string | undefined): string | undefined {
    if (name === undefined) {
        return "Frontmatter name must be a string.";
    }

    if (name.length > 64) {
        return "Frontmatter name must be no longer than 64 characters.";
    }

    if (name === "") {
        return "Frontmatter name cannot be empty.";
    }

    if (name.startsWith("-") || name.endsWith("-")) {
        return "Frontmatter name cannot start or end with a hyphen.";
    }

    let previousWasHyphen = false;

    for (const char of name) {
        if (char === "-") {
            if (previousWasHyphen) {
                return "Frontmatter name cannot contain consecutive hyphens.";
            }

            previousWasHyphen = true;
            continue;
        }

        previousWasHyphen = false;

        if (!isLowercaseAsciiLetter(char) && !isAsciiDigit(char)) {
            return "Frontmatter name must use lowercase hyphen-case with letters, digits, and hyphens only.";
        }
    }

    return undefined;
}

function validateSkillDescriptionValue(
    description: string | undefined,
): string | undefined {
    if (description === undefined) {
        return "Frontmatter description must be a string.";
    }

    if (description.length > 1024) {
        return "Frontmatter description must be no longer than 1024 characters.";
    }

    if (description.includes("<") || description.includes(">")) {
        return "Frontmatter description cannot contain angle brackets.";
    }

    return undefined;
}

function isLowercaseAsciiLetter(char: string): boolean {
    return char >= "a" && char <= "z";
}

function isAsciiDigit(char: string): boolean {
    return char >= "0" && char <= "9";
}
