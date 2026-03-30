import type { RegistrySkillSummary } from "./registry-skill-source.ts";
import { readFile, writeFile } from "node:fs/promises";

import { join } from "node:path";

export const installedRegistrySkillCompatibility = "Requires the oo CLI.";

interface SplitFrontmatterResult {
    body: string;
    frontmatterLines: string[];
}

interface FrontmatterFieldRange {
    end: number;
    key: string;
    start: number;
}

export async function rewriteInstalledRegistrySkillMarkdown(
    skillDirectoryPath: string,
    skill: RegistrySkillSummary,
    packageName: string,
): Promise<void> {
    const skillFilePath = join(skillDirectoryPath, "SKILL.md");
    const content = await readFile(skillFilePath, "utf8");
    const normalizedContent = normalizeInstalledRegistrySkillMarkdown(
        content,
        skill,
        packageName,
    );

    await writeFile(skillFilePath, normalizedContent, "utf8");
}

export function normalizeInstalledRegistrySkillMarkdown(
    content: string,
    skill: RegistrySkillSummary,
    packageName: string,
): string {
    const normalizedContent = normalizeLineEndings(content);
    const splitFrontmatter = trySplitFrontmatter(normalizedContent);

    if (splitFrontmatter === undefined) {
        return renderSkillMarkdown(
            createDefaultFrontmatterLines(skill, packageName),
            insertOoPackageExecutionGuidance(normalizedContent),
        );
    }

    return renderSkillMarkdown(
        upsertCompatibilityField(splitFrontmatter.frontmatterLines),
        insertOoPackageExecutionGuidance(splitFrontmatter.body),
    );
}

function normalizeLineEndings(content: string): string {
    return content
        .replaceAll("\r\n", "\n")
        .replaceAll("\r", "\n");
}

function trySplitFrontmatter(content: string): SplitFrontmatterResult | undefined {
    const lines = content.split("\n");

    if (lines[0] !== "---") {
        return undefined;
    }

    let delimiterIndex = 1;

    while (delimiterIndex < lines.length && lines[delimiterIndex] !== "---") {
        delimiterIndex += 1;
    }

    if (delimiterIndex >= lines.length) {
        return undefined;
    }

    return {
        body: lines.slice(delimiterIndex + 1).join("\n"),
        frontmatterLines: lines.slice(1, delimiterIndex),
    };
}

function createDefaultFrontmatterLines(
    skill: RegistrySkillSummary,
    packageName: string,
): string[] {
    const frontmatterLines = [
        `name: ${skill.name}`,
        `description: ${JSON.stringify(resolveSkillDescription(skill, packageName))}`,
        `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`,
    ];
    const title = resolveSkillTitle(skill);

    if (title !== skill.name) {
        frontmatterLines.push("metadata:");
        frontmatterLines.push(`  title: ${JSON.stringify(title)}`);
    }

    return frontmatterLines;
}

function resolveSkillDescription(
    skill: RegistrySkillSummary,
    packageName: string,
): string {
    const description = skill.description.trim();

    if (description !== "") {
        return description;
    }

    return `Use this skill when the task matches the installed instructions from the ${packageName} package.`;
}

function resolveSkillTitle(skill: RegistrySkillSummary): string {
    const title = skill.title.trim();

    if (title !== "") {
        return title;
    }

    return skill.name;
}

function upsertCompatibilityField(frontmatterLines: string[]): string[] {
    const fieldRanges = readFrontmatterFieldRanges(frontmatterLines);
    const compatibilityFieldLine
        = `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`;
    const compatibilityField = fieldRanges.find(
        field => field.key === "compatibility",
    );

    if (compatibilityField !== undefined) {
        return [
            ...frontmatterLines.slice(0, compatibilityField.start),
            compatibilityFieldLine,
            ...frontmatterLines.slice(compatibilityField.end),
        ];
    }

    const descriptionField = fieldRanges.find(field => field.key === "description");

    if (descriptionField !== undefined) {
        return [
            ...frontmatterLines.slice(0, descriptionField.end),
            compatibilityFieldLine,
            ...frontmatterLines.slice(descriptionField.end),
        ];
    }

    const nameField = fieldRanges.find(field => field.key === "name");

    if (nameField !== undefined) {
        return [
            ...frontmatterLines.slice(0, nameField.end),
            compatibilityFieldLine,
            ...frontmatterLines.slice(nameField.end),
        ];
    }

    return [compatibilityFieldLine, ...frontmatterLines];
}

function readFrontmatterFieldRanges(
    frontmatterLines: string[],
): FrontmatterFieldRange[] {
    const fieldRanges: FrontmatterFieldRange[] = [];
    let currentField: FrontmatterFieldRange | undefined;

    for (const [index, line] of frontmatterLines.entries()) {
        const fieldKey = readTopLevelFieldKey(line);

        if (fieldKey === undefined) {
            continue;
        }

        if (currentField !== undefined) {
            currentField.end = index;
            fieldRanges.push(currentField);
        }

        currentField = {
            end: frontmatterLines.length,
            key: fieldKey,
            start: index,
        };
    }

    if (currentField !== undefined) {
        fieldRanges.push(currentField);
    }

    return fieldRanges;
}

function readTopLevelFieldKey(line: string): string | undefined {
    if (line.startsWith(" ") || line.startsWith("\t")) {
        return undefined;
    }

    const separatorIndex = line.indexOf(":");

    if (separatorIndex <= 0) {
        return undefined;
    }

    return line.slice(0, separatorIndex).trim();
}

function insertOoPackageExecutionGuidance(body: string): string {
    const guidance = renderOoPackageExecutionGuidance();
    const trimmedBody = body.trim();

    if (trimmedBody === "") {
        return `${guidance}\n`;
    }

    const lines = trimmedBody.split("\n");
    const firstLine = lines[0] ?? "";

    if (isTopLevelHeading(firstLine)) {
        const remainingBody = lines.slice(1).join("\n").trim();

        if (remainingBody === "") {
            return `${firstLine}\n\n${guidance}\n`;
        }

        return `${firstLine}\n\n${guidance}\n\n${remainingBody}\n`;
    }

    return `${guidance}\n\n${trimmedBody}\n`;
}

function renderSkillMarkdown(frontmatterLines: string[], body: string): string {
    return [
        "---",
        ...frontmatterLines,
        "---",
        "",
        body.trimEnd(),
        "",
    ].join("\n");
}

function isTopLevelHeading(line: string): boolean {
    return line.startsWith("# ");
}
export function renderOoPackageExecutionGuidance(): string {
    return [
        "Important:",
        "If this skill mentions `oo::packageName` or `oo::packageName::blockName`,",
        "follow the `oo` CLI path instead of reimplementing the capability locally.",
        "First inspect the package with `oo packages info \"<packageName>\" --json`",
        "or `oo packages info \"<packageName>@<version>\" --json`.",
        "If only a package is referenced, choose the correct block id from the",
        "returned metadata.",
        "Even if a block is already named, inspect that block's `inputHandle` before",
        "running it.",
        "Use the resolved `packageVersion`, `blocks[].blockName`, and `inputHandle`",
        "metadata to build `oo cloud-task run \"<packageName>@<packageVersion>\"",
        "--block-id \"<blockName>\" --data '<json>' --json`.",
        "Use only argument names and values that are defined by or directly derived",
        "from the inspected metadata.",
        "If a required local file input is URI-compatible, upload it first with",
        "`oo file upload \"<filePath>\" --json` and pass the returned `downloadUrl`.",
        "`oo cloud-task run ... --json` returns a `taskID`, not the final result.",
        "To wait for completion, use `oo cloud-task wait \"<taskId>\" --timeout",
        "\"<window>\"`.",
        "Do not add `--json` to `oo cloud-task wait`.",
        "Use a bounded timeout such as `2m` to `10m` for short tasks, `15m` to",
        "`30m` for medium tasks, or `30m` to `60m` for long or unknown tasks.",
        "If `wait` exits non-zero, do not assume failure. Check",
        "`oo cloud-task result \"<taskId>\" --json` to distinguish timeout,",
        "failure, and late success, and do not create a new task just because a",
        "wait window ended.",
        "If the metadata is not sufficient to choose a safe block or construct safe",
        "arguments, stop and inspect further; do not guess parameters and do not run",
        "yet.",
    ].join("\n");
}
