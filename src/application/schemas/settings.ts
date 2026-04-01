import { stringify as stringifyToml } from "smol-toml";
import { z } from "zod";

import {
    supportedLocaleValues,
    supportedShellValues,
} from "../contracts/cli.ts";

export const localeSchema = z.enum(supportedLocaleValues);
export const shellSchema = z.enum(supportedShellValues);
export const booleanConfigValueChoices = ["true", "false"] as const;
export const booleanConfigValueSchema = z.enum(booleanConfigValueChoices);
export const fileDownloadOutDirConfigValueSchema = z.string().trim().min(1);

const fileDownloadSettingsShape = {
    out_dir: fileDownloadOutDirConfigValueSchema.optional(),
};

const fileDownloadSettingsReadSchema = z.object(fileDownloadSettingsShape);
const fileDownloadSettingsSchema = z.object(fileDownloadSettingsShape).strict();

const fileSettingsReadSchema = z.object({
    download: fileDownloadSettingsReadSchema.optional(),
});

const fileSettingsSchema = z.object({
    download: fileDownloadSettingsSchema.optional(),
}).strict();

const ooSkillSettingsShape = {
    implicit_invocation: z.boolean().optional(),
};

const skillImplicitInvocationReadSchema = z.object(ooSkillSettingsShape);
const skillImplicitInvocationSchema = z.object(ooSkillSettingsShape).strict();

const skillsSettingsReadSchema = z.object({
    "oo-find-skills": skillImplicitInvocationReadSchema.optional(),
    "oo": skillImplicitInvocationReadSchema.optional(),
});

const skillsSettingsSchema = z.object({
    "oo-find-skills": skillImplicitInvocationSchema.optional(),
    "oo": skillImplicitInvocationSchema.optional(),
}).strict();

export const defaultBundledSkillImplicitInvocation = true;

export const settingsFileReadSchema = z.object({
    file: fileSettingsReadSchema.optional(),
    lang: localeSchema.optional(),
    skills: skillsSettingsReadSchema.optional(),
});

export const settingsFileSchema = z.object({
    file: fileSettingsSchema.optional(),
    lang: localeSchema.optional(),
    skills: skillsSettingsSchema.optional(),
}).strict();

export type AppSettings = z.output<typeof settingsFileSchema>;
export type BooleanConfigValue = z.output<typeof booleanConfigValueSchema>;
export type BundledSkillSettingsKey = keyof NonNullable<AppSettings["skills"]>;
export const defaultFileDownloadOutDir = "~/Downloads";

export const defaultSettings: AppSettings = {};

const defaultSettingsCommentBlocks = [
    [
        "# lang controls the CLI display language for help text, messages, and errors.",
        "# Supported values: \"en\" (English), \"zh\" (Simplified Chinese).",
        "# Default: auto-detect from LC_ALL, LC_MESSAGES, LANG, then system locale.",
        "# lang = \"en\"",
    ],
    [
        "# file.download.out_dir controls the default output directory used by `oo file download` when [outDir] is omitted.",
        `# Default: ${defaultFileDownloadOutDir}.`,
        "# Supported values: any non-empty path string.",
        "# Relative values resolve from the current working directory when the command runs.",
        "# A leading `~` expands to the current user's home directory.",
        "# [file.download]",
        `# out_dir = "${defaultFileDownloadOutDir}"`,
    ],
    ...["oo", "oo-find-skills"].map(skillName => [
        `# skills.${skillName}.implicit_invocation controls whether Codex may invoke the bundled ${skillName} skill without an explicit mention.`,
        "# Supported values: true, false.",
        `# Default: ${stringifyBooleanConfigValue(defaultBundledSkillImplicitInvocation)}.`,
        `# [skills.${skillName}]`,
        "# implicit_invocation = false",
    ]),
] as const;

export function renderSettingsFile(settings: AppSettings): string {
    const parsedSettings = settingsFileSchema.parse(settings);
    const lines = defaultSettingsCommentBlocks.flatMap((block, index) => [
        ...(index === 0 ? [] : [""]),
        ...block,
    ]);
    const persistedSettings: Record<string, unknown> = {};

    if (parsedSettings.lang !== undefined) {
        persistedSettings.lang = parsedSettings.lang;
    }

    if (parsedSettings.file?.download?.out_dir !== undefined) {
        persistedSettings.file = {
            download: { out_dir: parsedSettings.file.download.out_dir },
        };
    }

    const persistedSkillSettings: Record<string, unknown> = {};

    for (const skillName of Object.keys(parsedSettings.skills ?? {})) {
        const skillSettings = parsedSettings.skills?.[skillName as BundledSkillSettingsKey];

        if (skillSettings?.implicit_invocation !== undefined) {
            persistedSkillSettings[skillName] = {
                implicit_invocation: skillSettings.implicit_invocation,
            };
        }
    }

    if (Object.keys(persistedSkillSettings).length > 0) {
        persistedSettings.skills = persistedSkillSettings;
    }

    const serializedSettings = stringifyToml(persistedSettings).trimEnd();

    if (serializedSettings !== "") {
        lines.push("", serializedSettings);
    }

    return `${lines.join("\n")}\n`;
}

export function parseBooleanConfigValue(value: BooleanConfigValue): boolean {
    return value === "true";
}

export function stringifyBooleanConfigValue(value: boolean): BooleanConfigValue {
    return value ? "true" : "false";
}

export function collectUnknownSettingsFileKeyPaths(
    rawInput: unknown,
    parsedInput: unknown,
): string[] {
    return collectStrippedObjectPaths(rawInput, parsedInput).sort();
}

export function getConfiguredFileDownloadOutDir(
    settings: AppSettings,
): string | undefined {
    return settings.file?.download?.out_dir;
}

export function setFileDownloadOutDir(
    settings: AppSettings,
    value: string,
): AppSettings {
    return {
        ...settings,
        file: {
            ...settings.file,
            download: {
                ...settings.file?.download,
                out_dir: value,
            },
        },
    };
}

export function unsetFileDownloadOutDir(
    settings: AppSettings,
): AppSettings {
    if (settings.file?.download?.out_dir === undefined) {
        return settings;
    }

    return deleteNestedProperty(settings, ["file", "download", "out_dir"]);
}

export function getConfiguredSkillImplicitInvocation(
    settings: AppSettings,
    skillName: BundledSkillSettingsKey,
): boolean | undefined {
    return settings.skills?.[skillName]?.implicit_invocation;
}

export function getSkillImplicitInvocation(
    settings: AppSettings,
    skillName: BundledSkillSettingsKey,
): boolean {
    return getConfiguredSkillImplicitInvocation(settings, skillName)
        ?? defaultBundledSkillImplicitInvocation;
}

export function setSkillImplicitInvocation(
    settings: AppSettings,
    skillName: BundledSkillSettingsKey,
    value: boolean,
): AppSettings {
    return {
        ...settings,
        skills: {
            ...settings.skills,
            [skillName]: {
                ...settings.skills?.[skillName],
                implicit_invocation: value,
            },
        },
    };
}

export function unsetSkillImplicitInvocation(
    settings: AppSettings,
    skillName: BundledSkillSettingsKey,
): AppSettings {
    if (settings.skills?.[skillName]?.implicit_invocation === undefined) {
        return settings;
    }

    return deleteNestedProperty(
        settings,
        ["skills", skillName, "implicit_invocation"],
    );
}

// Shallow-clones each level of a nested object along the given path,
// deletes the leaf property, and prunes any parent objects left empty.
function deleteNestedProperty(
    root: AppSettings,
    path: string[],
): AppSettings {
    if (path.length === 0) {
        return root;
    }

    // Build a chain of shallow clones along the path.
    const clones: Record<string, unknown>[] = [{ ...root }];

    for (let depth = 0; depth < path.length - 1; depth += 1) {
        const parent = clones[depth]!;
        const key = path[depth]!;
        const child = parent[key];

        if (child === null || typeof child !== "object" || Array.isArray(child)) {
            return root;
        }

        const clonedChild = { ...(child as Record<string, unknown>) };
        parent[key] = clonedChild;
        clones.push(clonedChild);
    }

    // Delete the leaf property.
    const leafParent = clones.at(-1)!;
    const leafKey = path.at(-1)!;
    delete leafParent[leafKey];

    // Prune empty parent objects from leaf back toward root.
    for (let depth = clones.length - 1; depth >= 1; depth -= 1) {
        const current = clones[depth]!;

        if (Object.keys(current).length > 0) {
            break;
        }

        const parentClone = clones[depth - 1]!;
        const parentKey = path[depth - 1]!;
        delete parentClone[parentKey];
    }

    return clones[0] as AppSettings;
}

function collectStrippedObjectPaths(
    rawValue: unknown,
    parsedValue: unknown,
    path: readonly string[] = [],
): string[] {
    if (!isPlainObjectRecord(rawValue) || !isPlainObjectRecord(parsedValue)) {
        return [];
    }

    const strippedPaths: string[] = [];

    for (const [key, childRawValue] of Object.entries(rawValue)) {
        const childPath = [...path, key];

        if (!Object.hasOwn(parsedValue, key)) {
            strippedPaths.push(childPath.join("."));
            continue;
        }

        strippedPaths.push(
            ...collectStrippedObjectPaths(
                childRawValue,
                parsedValue[key],
                childPath,
            ),
        );
    }

    return strippedPaths;
}

function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null
        && typeof value === "object"
        && !Array.isArray(value);
}
