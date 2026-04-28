import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";

import { lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import { writeLine } from "../shared/output.ts";
import {
    isNodeNotFoundError,
    publishBundledSkillInstallation,
    removePath,
} from "./bundled-skill-filesystem.ts";
import {
    directoryExists,
} from "./bundled-skill-observation.ts";
import {
    resolveBundledSkillDirectoryPath,
    resolveBundledSkillHomeDirectory,
} from "./bundled-skill-paths.ts";
import { availableBundledSkillAgentNames } from "./embedded-assets.ts";
import {
    isLocalSkillPathContained,
    resolveLocalSkillCanonicalDirectoryPath,
} from "./managed-skill-paths.ts";
import {
    installedRegistrySkillCompatibility,
    renderOoPackageExecutionGuidance,
} from "./registry-skill-markdown.ts";

interface SkillsInitInput {
    description?: string;
    icon?: string;
    name: string;
    title?: string;
}

interface LocalSkillHostPublicationTarget {
    agentName: BundledSkillAgentName;
    homeDirectory: string;
    installedSkillDirectoryPath: string;
}

interface LocalSkillHostPublicationResult {
    mode: "copy" | "symlink";
    path: string;
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

    const settingsFilePath = context.settingsStore.getFilePath();
    const canonicalSkillDirectoryPath = resolveLocalSkillCanonicalDirectoryPath(
        settingsFilePath,
        skillName,
    );
    const targets = await resolveLocalSkillPublicationTargets(context.env, skillName);

    if (targets.length === 0) {
        throw new CliUserError("errors.skills.noSupportedBundledSkillHosts", 1, {
            paths: availableBundledSkillAgentNames
                .map(agentName => resolveBundledSkillHomeDirectory(context.env, agentName))
                .join(", "),
        });
    }

    if (!isLocalSkillPathContained(
        targets[0]!.homeDirectory,
        settingsFilePath,
        skillName,
    )) {
        throw new CliUserError("errors.skills.invalidPath", 1, {
            name: skillName,
        });
    }

    await validateLocalSkillInitTargets(
        skillName,
        canonicalSkillDirectoryPath,
        targets,
    );

    await mkdir(canonicalSkillDirectoryPath, { recursive: true });

    const publishedTargets: LocalSkillHostPublicationTarget[] = [];
    const publishedResults: LocalSkillHostPublicationResult[] = [];

    try {
        await Bun.write(
            join(canonicalSkillDirectoryPath, "SKILL.md"),
            renderInitializedSkillMarkdown(skillName, description, icon, title),
        );

        for (const target of targets) {
            const published = await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath: target.installedSkillDirectoryPath,
                publicationMode: "symlink-or-copy",
            });

            publishedTargets.push(target);
            publishedResults.push({
                mode: published.mode,
                path: published.path,
            });

            context.logger.info(
                {
                    agentName: target.agentName,
                    canonicalPath: canonicalSkillDirectoryPath,
                    installMode: published.mode,
                    path: published.path,
                    skillName,
                },
                "Local skill initialized.",
            );
        }

        writeLine(
            context.stdout,
            context.translator.t("skills.init.success", {
                name: skillName,
                path: canonicalSkillDirectoryPath,
            }),
        );

        for (const publishedResult of publishedResults) {
            writeLine(
                context.stdout,
                context.translator.t(resolveSkillInitPublicationMessageKey(publishedResult.mode), {
                    name: skillName,
                    path: publishedResult.path,
                }),
            );
        }
    }
    catch (error) {
        await Promise.all([
            ...publishedTargets.map(target => removePath(target.installedSkillDirectoryPath)),
            removePath(canonicalSkillDirectoryPath),
        ]);
        throw error;
    }
}

function resolveSkillInitPublicationMessageKey(
    mode: LocalSkillHostPublicationResult["mode"],
): "skills.init.linked" | "skills.init.copied" {
    switch (mode) {
        case "symlink":
            return "skills.init.linked";
        case "copy":
            return "skills.init.copied";
    }
}

async function resolveLocalSkillPublicationTargets(
    env: Record<string, string | undefined>,
    skillName: string,
): Promise<LocalSkillHostPublicationTarget[]> {
    const targets = await Promise.all(
        availableBundledSkillAgentNames.map(async (agentName) => {
            const homeDirectory = resolveBundledSkillHomeDirectory(env, agentName);

            if (!(await directoryExists(homeDirectory))) {
                return undefined;
            }

            return {
                agentName,
                homeDirectory,
                installedSkillDirectoryPath: resolveBundledSkillDirectoryPath(
                    homeDirectory,
                    skillName,
                ),
            } satisfies LocalSkillHostPublicationTarget;
        }),
    );

    return targets.filter(target => target !== undefined);
}

async function validateLocalSkillInitTargets(
    skillName: string,
    canonicalSkillDirectoryPath: string,
    targets: readonly LocalSkillHostPublicationTarget[],
): Promise<void> {
    if (await pathExists(canonicalSkillDirectoryPath)) {
        throw new CliUserError("errors.skills.storageConflict", 1, {
            name: skillName,
            path: canonicalSkillDirectoryPath,
        });
    }

    const conflictingTarget = (
        await Promise.all(
            targets.map(async target =>
                (await pathExists(target.installedSkillDirectoryPath))
                    ? target
                    : undefined,
            ),
        )
    ).find(target => target !== undefined);

    if (conflictingTarget !== undefined) {
        throw new CliUserError("errors.skills.nameConflict", 1, {
            name: skillName,
            path: conflictingTarget.installedSkillDirectoryPath,
        });
    }
}

async function pathExists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    }
    catch (error) {
        if (isNodeNotFoundError(error)) {
            return false;
        }

        throw error;
    }
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
        "TODO: Describe the workflow this skill should follow.",
        "",
    ].join("\n");

    return matter.stringify(body, frontmatter);
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

function renderSkillTitle(skillName: string): string {
    return skillName
        .split("-")
        .filter(part => part !== "")
        .map(capitalizeAsciiWord)
        .join(" ");
}

function capitalizeAsciiWord(value: string): string {
    const firstChar = value[0];

    if (firstChar === undefined) {
        return value;
    }

    return `${firstChar.toUpperCase()}${value.slice(1)}`;
}

function isLowercaseAsciiLetter(char: string): boolean {
    return char >= "a" && char <= "z";
}

function isAsciiDigit(char: string): boolean {
    return char >= "0" && char <= "9";
}
