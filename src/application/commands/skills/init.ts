import type { CliCommandDefinition, CliExecutionContext } from "../../contracts/cli.ts";
import type { BundledSkillAgentName } from "./embedded-assets.ts";

import { lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";
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
import { renderSkillMetadataJson } from "./skill-metadata.ts";

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

const initializedSkillVersion = "0.0.1";

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

    try {
        await Promise.all([
            Bun.write(
                join(canonicalSkillDirectoryPath, "SKILL.md"),
                renderInitializedSkillMarkdown(skillName, description, title),
            ),
            Bun.write(
                join(canonicalSkillDirectoryPath, ".oo-metadata.json"),
                renderSkillMetadataJson(
                    icon === undefined
                        ? { version: initializedSkillVersion }
                        : { icon, version: initializedSkillVersion },
                ),
            ),
        ]);

        for (const target of targets) {
            const published = await publishBundledSkillInstallation({
                canonicalSkillDirectoryPath,
                installedSkillDirectoryPath: target.installedSkillDirectoryPath,
                publicationMode: "symlink-or-copy",
            });

            writeLine(
                context.stdout,
                context.translator.t("skills.init.success", {
                    name: skillName,
                    path: published.path,
                }),
            );
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
    }
    catch (error) {
        await removePath(canonicalSkillDirectoryPath);
        throw error;
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
    title: string | undefined,
): string {
    const frontmatterLines = [
        "---",
        `name: ${skillName}`,
        `description: ${JSON.stringify(description)}`,
        `compatibility: ${JSON.stringify(installedRegistrySkillCompatibility)}`,
    ];

    if (title !== undefined) {
        frontmatterLines.push(
            "metadata:",
            `  title: ${JSON.stringify(title)}`,
        );
    }

    frontmatterLines.push(
        "---",
        "",
        `# ${title ?? renderSkillTitle(skillName)}`,
        "",
        renderOoPackageExecutionGuidance(),
        "",
        "TODO: Describe the workflow this skill should follow.",
        "",
    );

    return frontmatterLines.join("\n");
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

    return normalizedCharacters.join("").slice(0, 64);
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
