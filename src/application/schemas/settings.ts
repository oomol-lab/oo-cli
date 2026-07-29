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

// Legacy home of the default team identity, kept readable so an installation
// that predates the account-scoped default still resolves one. Nothing writes
// it any more: it is migrated into the active account on the next run and
// deleted from here (see auth/default-team.ts, which owns both halves).
const identitySettingsShape = {
    team: z.string().trim().min(1).optional(),
};

const identitySettingsReadSchema = z.object(identitySettingsShape);
const identitySettingsSchema = z.object(identitySettingsShape).strict();

const skillsRecommendSettingsShape = {
    muted: z.boolean().optional(),
    dismissed: z.array(z.string()).optional(),
};

const skillsRecommendSettingsReadSchema = z.object(skillsRecommendSettingsShape);
const skillsRecommendSettingsSchema = z.object(skillsRecommendSettingsShape).strict();

// Standing policy for whether bundled skills may be loaded by an agent without
// the user naming them. `disabled_all` covers every bundled skill, including
// ones added by a later release; `disabled` names individual ones. This is an
// input to skill materialization, not a runtime switch: the effective value is
// baked into the published skill files (see skills/auto-trigger-policy.ts).
const skillsAutoTriggerSettingsShape = {
    disabled_all: z.boolean().optional(),
    disabled: z.array(z.string()).optional(),
};

const skillsAutoTriggerSettingsReadSchema = z.object(skillsAutoTriggerSettingsShape);
const skillsAutoTriggerSettingsSchema = z.object(skillsAutoTriggerSettingsShape).strict();

const skillsSettingsReadSchema = z.object({
    auto_trigger: skillsAutoTriggerSettingsReadSchema.optional(),
    recommend: skillsRecommendSettingsReadSchema.optional(),
});

const skillsSettingsSchema = z.object({
    auto_trigger: skillsAutoTriggerSettingsSchema.optional(),
    recommend: skillsRecommendSettingsSchema.optional(),
}).strict();

export const settingsFileReadSchema = z.object({
    file: fileSettingsReadSchema.optional(),
    identity: identitySettingsReadSchema.optional(),
    lang: localeSchema.optional(),
    skills: skillsSettingsReadSchema.optional(),
    telemetry: telemetrySettingsReadSchema.optional(),
});

export const settingsFileSchema = z.object({
    file: fileSettingsSchema.optional(),
    identity: identitySettingsSchema.optional(),
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
    [
        "# skills.auto_trigger controls whether agents may load a bundled skill without being asked to.",
        "# disabled_all: when true, every bundled skill is manual-only, including ones added later. Default: false.",
        "# disabled: bundled skill names that are manual-only. Default: none.",
        "# Manage these with `oo skills auto-trigger off` and `oo skills auto-trigger on`.",
        "# Editing this section by hand does not republish the skill files. To apply a hand-edited value, run:",
        "#   oo skills repair --skill oo --skill oo-find-skills --skill oo-create-skill --skill oo-publish-skill",
        "# [skills.auto_trigger]",
        "# disabled_all = false",
        "# disabled = [\"oo-create-skill\"]",
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

    // Written back verbatim rather than dropped: the value is legacy, but
    // until the migration has moved it into an account it is still the only
    // record of the user's default team, and an unrelated settings write
    // (`oo config set lang`, `oo telemetry disable`) must not erase it.
    if (parsedSettings.identity?.team !== undefined) {
        persistedSettings.identity = {
            team: parsedSettings.identity.team,
        };
    }

    const persistedSkills = buildPersistedSkillsSection(parsedSettings.skills);

    if (persistedSkills !== undefined) {
        persistedSettings.skills = persistedSkills;
    }

    const serializedSettings = stringifyToml(persistedSettings).trimEnd();

    if (serializedSettings !== "") {
        lines.push("", serializedSettings);
    }

    return `${lines.join("\n")}\n`;
}

// Both `[skills]` subsections drop keys that hold their implicit default, so an
// installation that never changed them keeps the file at its default shape. A
// subsection with nothing left to say is omitted, and so is `[skills]` itself.
function buildPersistedSkillsSection(
    skills: AppSettings["skills"],
): Record<string, unknown> | undefined {
    const persistedRecommend: Record<string, unknown> = {};
    const recommend = skills?.recommend;

    if (recommend?.muted === true) {
        persistedRecommend.muted = true;
    }

    if (recommend?.dismissed !== undefined && recommend.dismissed.length > 0) {
        persistedRecommend.dismissed = recommend.dismissed;
    }

    const persistedAutoTrigger: Record<string, unknown> = {};
    const autoTrigger = skills?.auto_trigger;

    if (autoTrigger?.disabled_all === true) {
        persistedAutoTrigger.disabled_all = true;
    }

    if (autoTrigger?.disabled !== undefined && autoTrigger.disabled.length > 0) {
        persistedAutoTrigger.disabled = autoTrigger.disabled;
    }

    const persistedSkills: Record<string, unknown> = {};

    if (Object.keys(persistedRecommend).length > 0) {
        persistedSkills.recommend = persistedRecommend;
    }

    if (Object.keys(persistedAutoTrigger).length > 0) {
        persistedSkills.auto_trigger = persistedAutoTrigger;
    }

    if (Object.keys(persistedSkills).length === 0) {
        return undefined;
    }

    return persistedSkills;
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

/**
 * Reads the legacy global default team. Only the migration consumes this;
 * every other caller asks the account for its default team.
 */
export function getLegacyIdentityTeam(
    settings: AppSettings,
): string | undefined {
    return settings.identity?.team;
}

/** Drops the legacy global default team once it has been migrated. */
export function unsetLegacyIdentityTeam(
    settings: AppSettings,
): AppSettings {
    if (settings.identity?.team === undefined) {
        return settings;
    }

    return deleteNestedProperty(settings, ["identity", "team"]);
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

export function isSkillAutoTriggerDisabledForAll(settings: AppSettings): boolean {
    return settings.skills?.auto_trigger?.disabled_all ?? false;
}

export function getAutoTriggerDisabledSkills(
    settings: AppSettings,
): readonly string[] {
    return settings.skills?.auto_trigger?.disabled ?? [];
}

// Writing the standing policy always clears the per-skill list: `--all` in
// either direction is the whole answer, so leaving a list behind would keep a
// second, contradictory record of the same state.
export function setSkillAutoTriggerDisabledForAll(
    settings: AppSettings,
    disabledAll: boolean,
): AppSettings {
    const cleared = deleteNestedProperty(settings, ["skills", "auto_trigger"]);

    if (!disabledAll) {
        return cleared;
    }

    return {
        ...cleared,
        skills: {
            ...cleared.skills,
            auto_trigger: { disabled_all: true },
        },
    };
}

// Adds skill names to the per-skill list, keeping the result de-duplicated and
// sorted for a stable settings file. A standing `disabled_all` is left alone;
// it already covers these names, and clearing it here would silently widen the
// command from "these skills" to "all skills".
export function addAutoTriggerDisabledSkills(
    settings: AppSettings,
    skillNames: readonly string[],
): AppSettings {
    const next = sortUnique([
        ...getAutoTriggerDisabledSkills(settings),
        ...skillNames,
    ]);

    return {
        ...settings,
        skills: {
            ...settings.skills,
            auto_trigger: {
                ...settings.skills?.auto_trigger,
                disabled: next,
            },
        },
    };
}

export function removeAutoTriggerDisabledSkills(
    settings: AppSettings,
    skillNames: readonly string[],
): AppSettings {
    const removal = new Set(skillNames);
    const current = getAutoTriggerDisabledSkills(settings);
    const next = current.filter(name => !removal.has(name));

    if (next.length === current.length) {
        return settings;
    }

    if (next.length === 0) {
        return deleteNestedProperty(settings, ["skills", "auto_trigger", "disabled"]);
    }

    return {
        ...settings,
        skills: {
            ...settings.skills,
            auto_trigger: {
                ...settings.skills?.auto_trigger,
                disabled: next,
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
