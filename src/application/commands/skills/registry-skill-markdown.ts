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
    const normalizedContent = resolveOoSelfReferences(
        normalizeLineEndings(content),
        packageName,
    );
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

function resolveOoSelfReferences(content: string, packageName: string): string {
    return content.replaceAll(
        "`oo::self::",
        `\`oo::${packageName}::`,
    );
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

export function renderOoPackageExecutionGuidance(): string {
    return [
        ooNoticeStartMarker,
        "",
        "Important:",
        "If this skill mentions `oo::packageName` or `oo::packageName::blockName`,",
        "follow the `oo` CLI path instead of reimplementing the capability locally.",
        "Inspect the referenced package once with `oo packages info \"<packageName>\"",
        "--json` or `oo packages info \"<packageName>@<version>\" --json`.",
        "If only a package is referenced, choose the correct block id from the",
        "returned metadata.",
        "Even if a block is already named, inspect that block's `inputHandle` before",
        "running it.",
        "Build the minimum viable execution contract: resolved",
        "`packageName@packageVersion`, `blocks[].blockName`, required inputs,",
        "payload, and expected result or artifact.",
        "Do not search for extra packages or inspect alternate blocks once that",
        "contract is complete.",
        "Use the resolved `packageVersion`, `blocks[].blockName`, and `inputHandle`",
        "metadata to build `oo cloud-task run \"<packageName>@<packageVersion>\"",
        "--block-id \"<blockName>\" --data '<json>' --json`.",
        "Use only argument names and values that are defined by or directly derived",
        "from the inspected metadata, and preserve the user's concrete constraints.",
        "If a required local file input is URI-compatible, upload it first with",
        "`oo file upload \"<filePath>\" --json` and pass the returned `downloadUrl`.",
        "Do not pass local absolute paths or local `file://...` URIs into cloud",
        "task payloads unless the inspected schema explicitly supports local paths;",
        "otherwise upload local files first because they are not cloud-accessible",
        "artifacts.",
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
        "Download only an explicit `resultURL` with `oo file download`; if success",
        "returns structured `resultData` without `resultURL`, report the useful",
        "structured result instead of inventing an artifact URL.",
        "If the metadata is not sufficient to choose a safe block or construct safe",
        "arguments, inspect only the missing contract field or report the blocker;",
        "do not guess parameters and do not run yet.",
        "",
        ooNoticeEndMarker,
    ].join("\n");
}
