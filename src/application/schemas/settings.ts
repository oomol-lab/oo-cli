import { stringify as stringifyToml } from "smol-toml";
import { z } from "zod";

import {
    supportedLocaleValues,
    supportedShellValues,
} from "../contracts/cli.ts";

export const localeSchema = z.enum(supportedLocaleValues);
export const shellSchema = z.enum(supportedShellValues);
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

const telemetrySettingsShape = {
    enabled: z.boolean().optional(),
};

const telemetrySettingsReadSchema = z.object(telemetrySettingsShape);
const telemetrySettingsSchema = z.object(telemetrySettingsShape).strict();

const skillsRecommendSettingsShape = {
    muted: z.boolean().optional(),
    dismissed: z.array(z.string()).optional(),
};

const skillsRecommendSettingsReadSchema = z.object(skillsRecommendSettingsShape);
const skillsRecommendSettingsSchema = z.object(skillsRecommendSettingsShape).strict();

const skillsSettingsReadSchema = z.object({
    recommend: skillsRecommendSettingsReadSchema.optional(),
});

const skillsSettingsSchema = z.object({
    recommend: skillsRecommendSettingsSchema.optional(),
}).strict();

export const settingsFileReadSchema = z.object({
    file: fileSettingsReadSchema.optional(),
    lang: localeSchema.optional(),
    skills: skillsSettingsReadSchema.optional(),
    telemetry: telemetrySettingsReadSchema.optional(),
});

export const settingsFileSchema = z.object({
    file: fileSettingsSchema.optional(),
    lang: localeSchema.optional(),
    skills: skillsSettingsSchema.optional(),
    telemetry: telemetrySettingsSchema.optional(),
}).strict();

export type AppSettings = z.output<typeof settingsFileSchema>;
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
        "# telemetry.enabled controls whether oo records privacy-constrained usage telemetry.",
        "# Default: true.",
        "# Supported values: true or false.",
        "# [telemetry]",
        "# enabled = true",
    ],
    [
        "# skills.recommend controls the end-of-session skill suggestions surfaced by the bundled `oo` skill.",
        "# muted: when true, oo never suggests installing or updating skills. Default: false.",
        "# dismissed: package names oo must never suggest again. Default: none.",
        "# Manage these with `oo skills recommend mute` and `oo skills recommend unmute`.",
        "# [skills.recommend]",
        "# muted = false",
        "# dismissed = [\"oo-gmail\"]",
    ],
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

    if (parsedSettings.telemetry?.enabled !== undefined) {
        persistedSettings.telemetry = {
            enabled: parsedSettings.telemetry.enabled,
        };
    }

    const recommend = parsedSettings.skills?.recommend;
    const persistedRecommend: Record<string, unknown> = {};

    // Only persist the global mute when it is on; `false` is the implicit
    // default and is left out to keep the file at its default shape.
    if (recommend?.muted === true) {
        persistedRecommend.muted = true;
    }

    if (recommend?.dismissed !== undefined && recommend.dismissed.length > 0) {
        persistedRecommend.dismissed = recommend.dismissed;
    }

    if (Object.keys(persistedRecommend).length > 0) {
        persistedSettings.skills = { recommend: persistedRecommend };
    }

    const serializedSettings = stringifyToml(persistedSettings).trimEnd();

    if (serializedSettings !== "") {
        lines.push("", serializedSettings);
    }

    return `${lines.join("\n")}\n`;
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

export function getConfiguredTelemetryEnabled(
    settings: AppSettings,
): boolean | undefined {
    return settings.telemetry?.enabled;
}

export function setTelemetryEnabled(
    settings: AppSettings,
    value: boolean,
): AppSettings {
    return {
        ...settings,
        telemetry: {
            ...settings.telemetry,
            enabled: value,
        },
    };
}

export function unsetTelemetryEnabled(
    settings: AppSettings,
): AppSettings {
    if (settings.telemetry?.enabled === undefined) {
        return settings;
    }

    return deleteNestedProperty(settings, ["telemetry", "enabled"]);
}

export function isSkillRecommendationsMuted(settings: AppSettings): boolean {
    return settings.skills?.recommend?.muted ?? false;
}

export function getDismissedSkillRecommendations(
    settings: AppSettings,
): readonly string[] {
    return settings.skills?.recommend?.dismissed ?? [];
}

// Persists the global mute flag. A `false` value clears the key so the file
// stays at its default shape instead of recording the implicit default.
export function setSkillRecommendationsMuted(
    settings: AppSettings,
    muted: boolean,
): AppSettings {
    if (!muted) {
        if (settings.skills?.recommend?.muted === undefined) {
            return settings;
        }

        return deleteNestedProperty(settings, ["skills", "recommend", "muted"]);
    }

    return {
        ...settings,
        skills: {
            ...settings.skills,
            recommend: {
                ...settings.skills?.recommend,
                muted: true,
            },
        },
    };
}

// Adds package names to the per-package dismissal list, keeping the result
// de-duplicated and sorted for a stable settings file.
export function addDismissedSkillRecommendations(
    settings: AppSettings,
    packageNames: readonly string[],
): AppSettings {
    const next = sortUnique([
        ...getDismissedSkillRecommendations(settings),
        ...packageNames,
    ]);

    return {
        ...settings,
        skills: {
            ...settings.skills,
            recommend: {
                ...settings.skills?.recommend,
                dismissed: next,
            },
        },
    };
}

// Removes package names from the dismissal list, pruning the key entirely when
// nothing remains.
export function removeDismissedSkillRecommendations(
    settings: AppSettings,
    packageNames: readonly string[],
): AppSettings {
    const removal = new Set(packageNames);
    const next = getDismissedSkillRecommendations(settings).filter(
        name => !removal.has(name),
    );

    if (next.length === getDismissedSkillRecommendations(settings).length) {
        return settings;
    }

    if (next.length === 0) {
        return deleteNestedProperty(settings, ["skills", "recommend", "dismissed"]);
    }

    return {
        ...settings,
        skills: {
            ...settings.skills,
            recommend: {
                ...settings.skills?.recommend,
                dismissed: next,
            },
        },
    };
}

function sortUnique(values: readonly string[]): string[] {
    return [...new Set(values)].sort((left, right) => left.localeCompare(right));
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
