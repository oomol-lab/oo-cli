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

const ooSkillSettingsSchema = z.object({
    allow_implicit_invocation: z.boolean().optional(),
}).strict();

const skillsSettingsSchema = z.object({
    oo: ooSkillSettingsSchema.optional(),
}).strict();

export const defaultOoSkillAllowImplicitInvocation = true;

export const settingsFileSchema = z.object({
    lang: localeSchema.optional(),
    skills: skillsSettingsSchema.optional(),
}).strict();

export type AppSettings = z.output<typeof settingsFileSchema>;
export type BooleanConfigValue = z.output<typeof booleanConfigValueSchema>;

export const defaultSettings: AppSettings = {};

const defaultSettingsCommentBlocks = [
    [
        "# lang controls the CLI display language for help text, messages, and errors.",
        "# Supported values: \"en\" (English), \"zh\" (Simplified Chinese).",
        "# Default: auto-detect from LC_ALL, LC_MESSAGES, LANG, then system locale.",
        "# lang = \"en\"",
    ],
    [
        "# skills.oo.allow_implicit_invocation controls whether Codex may invoke the bundled oo skill without an explicit mention.",
        "# Supported values: true, false.",
        `# Default: ${stringifyBooleanConfigValue(defaultOoSkillAllowImplicitInvocation)}.`,
        "# [skills.oo]",
        "# allow_implicit_invocation = false",
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
        ...(parsedSettings.skills?.oo?.allow_implicit_invocation !== undefined
            ? {
                    skills: {
                        oo: {
                            allow_implicit_invocation:
                                parsedSettings.skills.oo.allow_implicit_invocation,
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

export function getConfiguredOoSkillAllowImplicitInvocation(
    settings: AppSettings,
): boolean | undefined {
    return settings.skills?.oo?.allow_implicit_invocation;
}

export function getOoSkillAllowImplicitInvocation(
    settings: AppSettings,
): boolean {
    return getConfiguredOoSkillAllowImplicitInvocation(settings)
        ?? defaultOoSkillAllowImplicitInvocation;
}

export function setOoSkillAllowImplicitInvocation(
    settings: AppSettings,
    value: boolean,
): AppSettings {
    return {
        ...settings,
        skills: {
            ...settings.skills,
            oo: {
                ...settings.skills?.oo,
                allow_implicit_invocation: value,
            },
        },
    };
}

export function unsetOoSkillAllowImplicitInvocation(
    settings: AppSettings,
): AppSettings {
    if (settings.skills?.oo?.allow_implicit_invocation === undefined) {
        return settings;
    }

    const nextSettings = { ...settings };
    const nextSkills = { ...nextSettings.skills };
    const nextOoSkillSettings = { ...nextSkills.oo };

    delete nextOoSkillSettings.allow_implicit_invocation;

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
