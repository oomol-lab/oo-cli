import type { ZodType } from "zod";
import type { SupportedLocale } from "../../contracts/cli.ts";
import type { AppSettings, BundledSkillSettingsKey } from "../../schemas/settings.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import {
    booleanConfigValueChoices,
    booleanConfigValueSchema,
    fileDownloadOutDirConfigValueSchema,
    getConfiguredFileDownloadOutDir,
    getConfiguredSkillImplicitInvocation,
    localeSchema,
    parseBooleanConfigValue,
    setFileDownloadOutDir,
    setSkillImplicitInvocation,
    stringifyBooleanConfigValue,
    unsetFileDownloadOutDir,
    unsetSkillImplicitInvocation,
} from "../../schemas/settings.ts";

interface ConfigDefinition<TValue extends string> {
    createInvalidValueError: (rawValue: unknown) => CliUserError;
    getValue: (settings: AppSettings) => TValue | undefined;
    setValue: (settings: AppSettings, value: TValue) => AppSettings;
    unsetValue: (settings: AppSettings) => AppSettings;
    valueChoices: readonly TValue[];
    valueSchema: ZodType<TValue>;
}

function createValueErrorFactory(translationKey: string) {
    return function createInvalidValueError(rawValue: unknown): CliUserError {
        return new CliUserError(translationKey, 2, {
            value: String(rawValue ?? ""),
        });
    };
}

export const ooSkillImplicitInvocationConfigKey
    = "skills.oo.implicit_invocation" as const;
export const ooFindSkillsImplicitInvocationConfigKey
    = "skills.oo-find-skills.implicit_invocation" as const;
export const fileDownloadOutDirConfigKey = "file.download.out_dir" as const;

const skillImplicitInvocationConfigKeys: ReadonlySet<string> = new Set([
    ooSkillImplicitInvocationConfigKey,
    ooFindSkillsImplicitInvocationConfigKey,
]);

export function isSkillImplicitInvocationConfigKey(key: string): boolean {
    return skillImplicitInvocationConfigKeys.has(key);
}

function createSkillImplicitInvocationConfigDefinition(
    skillName: BundledSkillSettingsKey,
): ConfigDefinition<"false" | "true"> {
    return {
        createInvalidValueError(rawValue: unknown): CliUserError {
            return new CliUserError(
                "errors.config.invalidSkillImplicitInvocationValue",
                2,
                {
                    skill: skillName,
                    value: String(rawValue ?? ""),
                },
            );
        },
        getValue(settings: AppSettings): "false" | "true" | undefined {
            const configuredValue = getConfiguredSkillImplicitInvocation(settings, skillName);

            return configuredValue === undefined
                ? undefined
                : stringifyBooleanConfigValue(configuredValue);
        },
        setValue(settings: AppSettings, value: "false" | "true"): AppSettings {
            return setSkillImplicitInvocation(
                settings,
                skillName,
                parseBooleanConfigValue(value),
            );
        },
        unsetValue(settings: AppSettings): AppSettings {
            return unsetSkillImplicitInvocation(settings, skillName);
        },
        valueChoices: booleanConfigValueChoices,
        valueSchema: booleanConfigValueSchema,
    };
}

export const configDefinitions = {
    lang: {
        createInvalidValueError: createValueErrorFactory("errors.config.invalidLangValue"),
        getValue(settings: AppSettings): SupportedLocale | undefined {
            return settings.lang;
        },
        setValue(settings: AppSettings, value: SupportedLocale): AppSettings {
            return {
                ...settings,
                lang: value,
            };
        },
        unsetValue(settings: AppSettings): AppSettings {
            const nextSettings = { ...settings };

            delete nextSettings.lang;

            return nextSettings;
        },
        valueChoices: localeSchema.options,
        valueSchema: localeSchema,
    } satisfies ConfigDefinition<SupportedLocale>,
    [fileDownloadOutDirConfigKey]: {
        createInvalidValueError: createValueErrorFactory("errors.config.invalidFileDownloadOutDirValue"),
        getValue(settings: AppSettings): string | undefined {
            return getConfiguredFileDownloadOutDir(settings);
        },
        setValue(settings: AppSettings, value: string): AppSettings {
            return setFileDownloadOutDir(settings, value);
        },
        unsetValue(settings: AppSettings): AppSettings {
            return unsetFileDownloadOutDir(settings);
        },
        valueChoices: [],
        valueSchema: fileDownloadOutDirConfigValueSchema,
    } satisfies ConfigDefinition<string>,
    [ooSkillImplicitInvocationConfigKey]:
        createSkillImplicitInvocationConfigDefinition("oo"),
    [ooFindSkillsImplicitInvocationConfigKey]:
        createSkillImplicitInvocationConfigDefinition("oo-find-skills"),
} as const;

export type ConfigKey = keyof typeof configDefinitions;

export const configKeyChoices = Object.freeze(
    Object.keys(configDefinitions) as ConfigKey[],
);

export function isConfigKey(value: unknown): value is ConfigKey {
    return typeof value === "string" && value in configDefinitions;
}

export const configKeySchema = z.custom<ConfigKey>(
    isConfigKey,
);

export interface ConfigKeyInput {
    key: ConfigKey;
}

export function createInvalidConfigKeyError(
    rawInput: Record<string, unknown>,
): CliUserError {
    return new CliUserError("errors.config.invalidKey", 2, {
        value: String(rawInput.key ?? ""),
    });
}

export function getConfigValue(
    settings: AppSettings,
    key: ConfigKey,
): string | undefined {
    return configDefinitions[key].getValue(settings);
}
