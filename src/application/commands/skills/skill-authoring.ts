import type { SkillFrontmatterRecord } from "./skill-frontmatter.ts";

import { join } from "node:path";
import { CliUserError } from "../../contracts/cli.ts";
import { readSkillFileContent } from "./local-skill-ownership.ts";
import { installedRegistrySkillCompatibility } from "./registry-skill-markdown.ts";
import {
    isSkillFrontmatterRecord,
    parseSkillMarkdownMatter,
    stringifySkillMarkdownMatter,
    toNonBlankString,
} from "./skill-frontmatter.ts";
import { renderSkillTitle } from "./skill-title.ts";

const defaultSkillIcon = ":lucide:wrench:";

export interface SkillAuthoringFields {
    description?: string;
    icon?: string;
    name: string;
    title?: string;
}

export function renderInitializedSkillMarkdown(
    fields: SkillAuthoringFields,
): string {
    const completeFields = resolveCompleteSkillFields(fields, {});

    return stringifySkillMarkdownMatter(
        renderLocalWorkflowSkillBody(completeFields.title),
        createSkillFrontmatter(completeFields, {}),
    );
}

export async function writeAdoptedSkillContract(
    skillDirectoryPath: string,
    fields: SkillAuthoringFields,
): Promise<void> {
    const currentContent = await readSkillFileContent(skillDirectoryPath);
    const content = currentContent === undefined
        ? renderInitializedSkillMarkdown(resolveCompleteSkillFields(fields, {}))
        : renderPatchedSkillMarkdown(currentContent, fields);

    await Bun.write(join(skillDirectoryPath, "SKILL.md"), content);
}

export function readSkillFrontmatterName(
    content: string | undefined,
): string | undefined {
    if (content === undefined) {
        return undefined;
    }

    try {
        const parsedMatter = parseSkillMarkdownMatter(content);

        return toNonBlankString(parsedMatter.data.name);
    }
    catch {
        return undefined;
    }
}

function renderPatchedSkillMarkdown(
    content: string,
    fields: SkillAuthoringFields,
): string {
    let parsedMatter: ReturnType<typeof parseSkillMarkdownMatter>;

    try {
        parsedMatter = parseSkillMarkdownMatter(content);
    }
    catch {
        throw new CliUserError("errors.skills.adopt.invalidSkillMarkdown", 1);
    }

    const frontmatter = createSkillFrontmatter(fields, parsedMatter.data);

    return stringifySkillMarkdownMatter(parsedMatter.content, frontmatter);
}

function createSkillFrontmatter(
    fields: SkillAuthoringFields,
    currentFrontmatter: SkillFrontmatterRecord,
): SkillFrontmatterRecord {
    const completeFields = resolveCompleteSkillFields(fields, currentFrontmatter);
    const currentMetadata = isSkillFrontmatterRecord(currentFrontmatter.metadata)
        ? currentFrontmatter.metadata
        : {};

    return {
        ...currentFrontmatter,
        name: completeFields.name,
        description: completeFields.description,
        compatibility: toNonBlankString(currentFrontmatter.compatibility)
            ?? installedRegistrySkillCompatibility,
        metadata: {
            ...currentMetadata,
            icon: completeFields.icon,
            title: completeFields.title,
        },
    };
}

function resolveCompleteSkillFields(
    fields: SkillAuthoringFields,
    currentFrontmatter: SkillFrontmatterRecord,
): Required<SkillAuthoringFields> {
    const currentMetadata = isSkillFrontmatterRecord(currentFrontmatter.metadata)
        ? currentFrontmatter.metadata
        : {};
    const description = fields.description
        ?? toNonBlankString(currentFrontmatter.description);

    if (description === undefined) {
        throw new CliUserError("errors.skills.init.descriptionRequired", 1);
    }

    return {
        description,
        icon: fields.icon
            ?? toNonBlankString(currentMetadata.icon)
            ?? toNonBlankString(currentFrontmatter.icon)
            ?? defaultSkillIcon,
        name: fields.name,
        title: fields.title
            ?? toNonBlankString(currentMetadata.title)
            ?? toNonBlankString(currentFrontmatter.title)
            ?? renderSkillTitle(fields.name),
    };
}

function renderLocalWorkflowSkillBody(title: string): string {
    return [
        "",
        `# ${title}`,
        "",
        "## When to Use",
        "",
        "TODO: Describe the user requests and outcomes that should trigger this skill.",
        "",
        "## Inputs",
        "",
        "- TODO: List required files, config values, credentials, or user decisions.",
        "- TODO: List optional inputs and defaults.",
        "",
        "## Execution",
        "",
        "TODO: Describe the local scripts, commands, working directory, environment variables, and generated files.",
        "",
        "## Result Handling",
        "",
        "TODO: Describe output files, validation checks, previews, and what to report to the user.",
        "",
        "## Failure Handling",
        "",
        "TODO: Describe missing files, invalid config, dependency, permission, timeout, and validation failures.",
        "",
    ].join("\n");
}
