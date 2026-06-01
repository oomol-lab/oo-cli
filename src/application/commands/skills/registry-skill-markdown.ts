import type { RegistrySkillSummary } from "./registry-skill-source.ts";
import { readFile, writeFile } from "node:fs/promises";

import { join } from "node:path";

export const installedRegistrySkillCompatibility = "Requires the oo CLI.";
export const ooNoticeStartMarker = "<!-- OO NOTICE START -->";
export const ooNoticeEndMarker = "<!-- OO NOTICE END -->";

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
            removeOoNoticeBlocks(normalizedContent),
        );
    }

    return renderSkillMarkdown(
        upsertCompatibilityField(splitFrontmatter.frontmatterLines),
        removeOoNoticeBlocks(splitFrontmatter.body),
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

function renderSkillMarkdown(frontmatterLines: string[], body: string): string {
    return [
        "---",
        ...frontmatterLines,
        "---",
        "",
        body.trim(),
        "",
    ].join("\n");
}

export function removeOoNoticeBlocks(content: string): string {
    const outputLines: string[] = [];
    let pendingNoticeLines: string[] | undefined;
    let removedNotice = false;
    let skipDuplicateBlankAfterNotice = false;

    for (const line of content.split("\n")) {
        if (pendingNoticeLines !== undefined) {
            pendingNoticeLines.push(line);

            if (line.trim() === ooNoticeEndMarker) {
                pendingNoticeLines = undefined;
                removedNotice = true;
                skipDuplicateBlankAfterNotice
                    = outputLines.at(-1)?.trim() === "";
            }

            continue;
        }

        if (line.trim() === ooNoticeStartMarker) {
            pendingNoticeLines = [line];
            continue;
        }

        if (skipDuplicateBlankAfterNotice && line.trim() === "") {
            skipDuplicateBlankAfterNotice = false;
            continue;
        }

        skipDuplicateBlankAfterNotice = false;
        outputLines.push(line);
    }

    if (pendingNoticeLines !== undefined) {
        outputLines.push(...pendingNoticeLines);
    }

    if (!removedNotice) {
        return content;
    }

    return outputLines.join("\n");
}

export function removeManagedOoSkillArtifacts(content: string): string {
    const contentWithoutNotice = removeOoNoticeBlocks(content);

    return removeInstalledRegistrySkillCompatibilityField(contentWithoutNotice);
}

function removeInstalledRegistrySkillCompatibilityField(content: string): string {
    const splitFrontmatter = trySplitFrontmatter(content);

    if (splitFrontmatter === undefined) {
        return content;
    }

    const compatibilityField = readFrontmatterFieldRanges(
        splitFrontmatter.frontmatterLines,
    ).find(field => field.key === "compatibility");

    if (compatibilityField === undefined) {
        return content;
    }

    const compatibility = readInlineStringFieldValue(
        splitFrontmatter.frontmatterLines[compatibilityField.start] ?? "",
    );

    if (compatibility !== installedRegistrySkillCompatibility) {
        return content;
    }

    return renderSkillMarkdown(
        [
            ...splitFrontmatter.frontmatterLines.slice(0, compatibilityField.start),
            ...splitFrontmatter.frontmatterLines.slice(compatibilityField.end),
        ],
        splitFrontmatter.body.trimStart(),
    );
}

function readInlineStringFieldValue(line: string): string | undefined {
    const separatorIndex = line.indexOf(":");

    if (separatorIndex < 0) {
        return undefined;
    }

    const rawValue = line.slice(separatorIndex + 1).trim();

    if (rawValue === "") {
        return undefined;
    }

    if (rawValue.startsWith("\"") && rawValue.endsWith("\"")) {
        try {
            const parsed = JSON.parse(rawValue) as unknown;

            return typeof parsed === "string" ? parsed : undefined;
        }
        catch {
            return undefined;
        }
    }

    if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
        return rawValue.slice(1, -1).replaceAll("''", "'");
    }

    return rawValue;
}
