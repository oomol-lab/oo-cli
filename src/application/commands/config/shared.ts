import type { ZodType } from "zod";
import type {
    CliExecutionContext,
    SupportedLocale,
} from "../../contracts/cli.ts";
import type { AppSettings } from "../../schemas/settings.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import {
    booleanConfigValueChoices,
    booleanConfigValueSchema,
    getConfiguredOoSkillAllowImplicitInvocation,
    localeSchema,
    parseBooleanConfigValue,
    setOoSkillAllowImplicitInvocation,
    stringifyBooleanConfigValue,
    unsetOoSkillAllowImplicitInvocation,
} from "../../schemas/settings.ts";

export interface ConfigDefinition<TValue extends string> {
    createInvalidValueError: (rawValue: unknown) => CliUserError;
    getValue: (settings: AppSettings) => TValue | undefined;
    setValue: (settings: AppSettings, value: TValue) => AppSettings;
    unsetValue: (settings: AppSettings) => AppSettings;
    valueChoices: readonly TValue[];
    valueSchema: ZodType<TValue>;
}

function defineConfigDefinition<TValue extends string>(
    definition: ConfigDefinition<TValue>,
): ConfigDefinition<TValue> {
    return definition;
}

export const ooSkillAllowImplicitInvocationConfigKey
    = "skills.oo.allow_implicit_invocation" as const;

export const configDefinitions = {
    lang: defineConfigDefinition({
        createInvalidValueError(rawValue: unknown): CliUserError {
            return new CliUserError("errors.config.invalidLangValue", 2, {
                value: String(rawValue ?? ""),
            });
        },
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
    }),
    [ooSkillAllowImplicitInvocationConfigKey]: defineConfigDefinition({
        createInvalidValueError(rawValue: unknown): CliUserError {
            return new CliUserError(
                "errors.config.invalidSkillsOoAllowImplicitInvocationValue",
                2,
                {
                    value: String(rawValue ?? ""),
                },
            );
        },
        getValue(settings: AppSettings): "false" | "true" | undefined {
            const configuredValue
                = getConfiguredOoSkillAllowImplicitInvocation(settings);

            return configuredValue === undefined
                ? undefined
                : stringifyBooleanConfigValue(configuredValue);
        },
        setValue(settings: AppSettings, value: "false" | "true"): AppSettings {
            return setOoSkillAllowImplicitInvocation(
                settings,
                parseBooleanConfigValue(value),
            );
        },
        unsetValue(settings: AppSettings): AppSettings {
            return unsetOoSkillAllowImplicitInvocation(settings);
        },
        valueChoices: booleanConfigValueChoices,
        valueSchema: booleanConfigValueSchema,
    }),
} as const;

export type ConfigKey = keyof typeof configDefinitions;
type ConfigDefinitionValue<TKey extends ConfigKey> = z.output<
    (typeof configDefinitions)[TKey]["valueSchema"]
>;

export const configKeyChoices = Object.freeze(
    Object.keys(configDefinitions) as ConfigKey[],
);

export function isConfigKey(value: unknown): value is ConfigKey {
    return typeof value === "string" && value in configDefinitions;
}

export const configKeySchema = z.custom<ConfigKey>(
    isConfigKey,
);

export interface ConfigGetInput {
    key: ConfigKey;
}

export interface ConfigListInput {}

export type ConfigSetInput = {
    [TKey in ConfigKey]: {
        key: TKey;
        value: ConfigDefinitionValue<TKey>;
    };
}[ConfigKey];

export interface ConfigUnsetInput {
    key: ConfigKey;
}

export function writeLine(context: CliExecutionContext, message: string): void {
    context.stdout.write(`${message}\n`);
}

export function createInvalidConfigKeyError(
    rawInput: Record<string, unknown>,
): CliUserError {
    return new CliUserError("errors.config.invalidKey", 2, {
        value: String(rawInput.key ?? ""),
    });
}

export function getConfigDefinition<TKey extends ConfigKey>(
    key: TKey,
): (typeof configDefinitions)[TKey] {
    return configDefinitions[key];
}

export function getConfigDefinitionByRawKey(
    rawKey: unknown,
): (typeof configDefinitions)[ConfigKey] | undefined {
    return isConfigKey(rawKey) ? getConfigDefinition(rawKey) : undefined;
}

export function createConfigSetInput<TKey extends ConfigKey>(
    key: TKey,
    value: ConfigDefinitionValue<TKey>,
): Extract<ConfigSetInput, { key: TKey }> {
    return { key, value } as Extract<ConfigSetInput, { key: TKey }>;
}

export function getConfigValue(
    settings: AppSettings,
    key: ConfigKey,
): string | undefined {
    return getConfigDefinition(key).getValue(settings);
}
