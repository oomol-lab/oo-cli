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

const fileDownloadSettingsSchema = z.object({
    out_dir: fileDownloadOutDirConfigValueSchema.optional(),
}).strict();

const fileSettingsSchema = z.object({
    download: fileDownloadSettingsSchema.optional(),
}).strict();

const ooSkillSettingsSchema = z.object({
    implicit_invocation: z.boolean().optional(),
}).strict();

const skillsSettingsSchema = z.object({
    oo: ooSkillSettingsSchema.optional(),
}).strict();

export const defaultOoSkillImplicitInvocation = true;

export const settingsFileSchema = z.object({
    file: fileSettingsSchema.optional(),
    lang: localeSchema.optional(),
    skills: skillsSettingsSchema.optional(),
}).strict();

export type AppSettings = z.output<typeof settingsFileSchema>;
export type BooleanConfigValue = z.output<typeof booleanConfigValueSchema>;
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
    [
        "# skills.oo.implicit_invocation controls whether Codex may invoke the bundled oo skill without an explicit mention.",
        "# Supported values: true, false.",
        `# Default: ${stringifyBooleanConfigValue(defaultOoSkillImplicitInvocation)}.`,
        "# [skills.oo]",
        "# implicit_invocation = false",
    ],
] as const;

export function renderSettingsFile(settings: AppSettings): string {
    const parsedSettings = settingsFileSchema.parse(settings);
    const lines = defaultSettingsCommentBlocks.flatMap((block, index) => [
        ...(index === 0 ? [] : [""]),
        ...block,
    ]);
    const persistedSettings = {
        ...(parsedSettings.lang !== undefined
            ? {
                    lang: parsedSettings.lang,
                }
            : {}),
        ...(parsedSettings.file?.download?.out_dir !== undefined
            ? {
                    file: {
                        download: {
                            out_dir: parsedSettings.file.download.out_dir,
                        },
                    },
                }
            : {}),
        ...(parsedSettings.skills?.oo?.implicit_invocation !== undefined
            ? {
                    skills: {
                        oo: {
                            implicit_invocation:
                                parsedSettings.skills.oo.implicit_invocation,
                        },
                    },
                }
            : {}),
    };
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

    const nextSettings = { ...settings };
    const nextFileSettings = { ...nextSettings.file };
    const nextFileDownloadSettings = { ...nextFileSettings.download };

    delete nextFileDownloadSettings.out_dir;

    if (Object.keys(nextFileDownloadSettings).length === 0) {
        delete nextFileSettings.download;
    }
    else {
        nextFileSettings.download = nextFileDownloadSettings;
    }

    if (Object.keys(nextFileSettings).length === 0) {
        delete nextSettings.file;
    }
    else {
        nextSettings.file = nextFileSettings;
    }

    return nextSettings;
}

export function getConfiguredOoSkillImplicitInvocation(
    settings: AppSettings,
): boolean | undefined {
    return settings.skills?.oo?.implicit_invocation;
}

export function getOoSkillImplicitInvocation(
    settings: AppSettings,
): boolean {
    return getConfiguredOoSkillImplicitInvocation(settings)
        ?? defaultOoSkillImplicitInvocation;
}

export function setOoSkillImplicitInvocation(
    settings: AppSettings,
    value: boolean,
): AppSettings {
    return {
        ...settings,
        skills: {
            ...settings.skills,
            oo: {
                ...settings.skills?.oo,
                implicit_invocation: value,
            },
        },
    };
}

export function unsetOoSkillImplicitInvocation(
    settings: AppSettings,
): AppSettings {
    if (settings.skills?.oo?.implicit_invocation === undefined) {
        return settings;
    }

    const nextSettings = { ...settings };
    const nextSkills = { ...nextSettings.skills };
    const nextOoSkillSettings = { ...nextSkills.oo };

    delete nextOoSkillSettings.implicit_invocation;

    if (Object.keys(nextOoSkillSettings).length === 0) {
        delete nextSkills.oo;
    }
    else {
        nextSkills.oo = nextOoSkillSettings;
    }

    if (Object.keys(nextSkills).length === 0) {
        delete nextSettings.skills;
    }
    else {
        nextSettings.skills = nextSkills;
    }

    return nextSettings;
}
