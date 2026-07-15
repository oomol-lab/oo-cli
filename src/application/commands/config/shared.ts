import type { AppSettings } from "../../schemas/settings.ts";

import { z } from "zod";
import { CliUserError } from "../../contracts/cli.ts";
import {
    getConfiguredFileDownloadOutDir,
    getConfiguredIdentityTeam,
    getConfiguredTelemetryEnabled,
    localeSchema,
    setFileDownloadOutDir,
    setIdentityTeam,
    setTelemetryEnabled,
    unsetFileDownloadOutDir,
    unsetIdentityTeam,
    unsetTelemetryEnabled,
} from "../../schemas/settings.ts";

interface ParsedConfigValue {
    readonly apply: (settings: AppSettings) => AppSettings;
    readonly renderedValue: string;
}

interface ConfigDefinition {
    createInvalidValueError: (rawValue: unknown) => CliUserError;
    getValue: (settings: AppSettings) => string | undefined;
    parseRawValue: (rawValue: string) => ParsedConfigValue | undefined;
    unsetValue: (settings: AppSettings) => AppSettings;
}

function createValueErrorFactory(translationKey: string) {
    return function createInvalidValueError(rawValue: unknown): CliUserError {
        return new CliUserError(translationKey, 2, {
            value: String(rawValue ?? ""),
        });
    };
}

const fileDownloadOutDirConfigKey = "file.download.out_dir" as const;
const identityTeamConfigKey = "identity.team" as const;
export const telemetryEnabledConfigKey = "telemetry.enabled" as const;

export const configDefinitions = {
    lang: {
        createInvalidValueError: createValueErrorFactory("errors.config.invalidLangValue"),
        getValue(settings: AppSettings): string | undefined {
            return settings.lang;
        },
        parseRawValue(rawValue: string): ParsedConfigValue | undefined {
            const result = localeSchema.safeParse(rawValue);

            if (!result.success) {
                return undefined;
            }

            return {
                apply: settings => ({
                    ...settings,
                    lang: result.data,
                }),
                renderedValue: result.data,
            };
        },
        unsetValue(settings: AppSettings): AppSettings {
            const nextSettings = { ...settings };

            delete nextSettings.lang;

            return nextSettings;
        },
    } satisfies ConfigDefinition,
    [fileDownloadOutDirConfigKey]: {
        createInvalidValueError: createValueErrorFactory("errors.config.invalidFileDownloadOutDirValue"),
        getValue(settings: AppSettings): string | undefined {
            return getConfiguredFileDownloadOutDir(settings);
        },
        parseRawValue(rawValue: string): ParsedConfigValue | undefined {
            const value = rawValue.trim();

            if (value === "") {
                return undefined;
            }

            return {
                apply: settings => setFileDownloadOutDir(settings, value),
                renderedValue: value,
            };
        },
        unsetValue(settings: AppSettings): AppSettings {
            return unsetFileDownloadOutDir(settings);
        },
    } satisfies ConfigDefinition,
    [telemetryEnabledConfigKey]: {
        createInvalidValueError: createValueErrorFactory("errors.config.invalidTelemetryEnabledValue"),
        getValue(settings: AppSettings): string | undefined {
            const value = getConfiguredTelemetryEnabled(settings);

            return value === undefined ? undefined : String(value);
        },
        parseRawValue(rawValue: string): ParsedConfigValue | undefined {
            switch (rawValue) {
                case "false":
                    return {
                        apply: settings => setTelemetryEnabled(settings, false),
                        renderedValue: "false",
                    };
                case "true":
                    return {
                        apply: settings => setTelemetryEnabled(settings, true),
                        renderedValue: "true",
                    };
                default:
                    return undefined;
            }
        },
        unsetValue(settings: AppSettings): AppSettings {
            return unsetTelemetryEnabled(settings);
        },
    } satisfies ConfigDefinition,
    [identityTeamConfigKey]: {
        createInvalidValueError: createValueErrorFactory("errors.config.invalidIdentityTeamValue"),
        getValue(settings: AppSettings): string | undefined {
            return getConfiguredIdentityTeam(settings);
        },
        parseRawValue(rawValue: string): ParsedConfigValue | undefined {
            const value = rawValue.trim();

            if (value === "") {
                return undefined;
            }

            return {
                apply: settings => setIdentityTeam(settings, value),
                renderedValue: value,
            };
        },
        unsetValue(settings: AppSettings): AppSettings {
            return unsetIdentityTeam(settings);
        },
    } satisfies ConfigDefinition,
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
