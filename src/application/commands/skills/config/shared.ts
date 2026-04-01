import type { ZodType } from "zod";
import type { AppSettings } from "../../../schemas/settings.ts";

import { z } from "zod";
import { CliUserError } from "../../../contracts/cli.ts";
import {
    booleanConfigValueChoices,
    booleanConfigValueSchema,
    getSkillImplicitInvocation,
    parseBooleanConfigValue,
    setSkillImplicitInvocation,
    stringifyBooleanConfigValue,
} from "../../../schemas/settings.ts";

export const skillConfigSkillChoices = ["oo", "oo-find-skills"] as const;
export type ConfigurableBundledSkillName = (typeof skillConfigSkillChoices)[number];

interface SkillConfigDefinition {
    createInvalidValueError: (
        skillName: ConfigurableBundledSkillName,
        rawValue: unknown,
    ) => CliUserError;
    getValue: (settings: AppSettings) => string;
    setValue: (settings: AppSettings, value: string) => AppSettings;
    valueChoices: readonly string[];
    valueSchema: ZodType<string>;
}

function createAllowImplicitInvocationDefinition(
    skillName: ConfigurableBundledSkillName,
): SkillConfigDefinition {
    return {
        createInvalidValueError(displaySkillName, rawValue) {
            return new CliUserError(
                "errors.skills.config.invalidAllowImplicitInvocationValue",
                2,
                {
                    skill: displaySkillName,
                    value: String(rawValue ?? ""),
                },
            );
        },
        getValue(settings) {
            return stringifyBooleanConfigValue(
                getSkillImplicitInvocation(settings, skillName),
            );
        },
        setValue(settings, value) {
            return setSkillImplicitInvocation(
                settings,
                skillName,
                parseBooleanConfigValue(
                    booleanConfigValueSchema.parse(value),
                ),
            );
        },
        valueChoices: booleanConfigValueChoices,
        valueSchema: booleanConfigValueSchema,
    };
}

const skillConfigDefinitions = Object.fromEntries(
    skillConfigSkillChoices.map(skillName => [
        skillName,
        {
            "allow-implicit-invocation":
                createAllowImplicitInvocationDefinition(skillName),
        } satisfies Record<string, SkillConfigDefinition>,
    ]),
) as unknown as Record<ConfigurableBundledSkillName, Record<string, SkillConfigDefinition>>;

export const skillConfigSkillSchema = z.enum(skillConfigSkillChoices);

export function isBundledSkillName(
    value: unknown,
): value is ConfigurableBundledSkillName {
    return typeof value === "string" && value in skillConfigDefinitions;
}

export function createInvalidSkillConfigSkillError(
    rawInput: Record<string, unknown>,
): CliUserError {
    return new CliUserError("errors.skills.invalidName", 2, {
        choices: skillConfigSkillChoices.join(", "),
        value: String(rawInput.skill ?? ""),
    });
}

export function createInvalidSkillConfigKeyError(
    rawInput: Record<string, unknown>,
): CliUserError {
    const skillName = isBundledSkillName(rawInput.skill)
        ? rawInput.skill
        : skillConfigSkillChoices[0];

    return new CliUserError("errors.skills.config.invalidKey", 2, {
        choices: getSkillConfigKeyChoices(skillName).join(", "),
        skill: String(rawInput.skill ?? ""),
        value: String(rawInput.key ?? ""),
    });
}

export function getSkillConfigKeyChoices(
    skillName: ConfigurableBundledSkillName,
): readonly string[] {
    return Object.keys(getSkillConfigDefinitions(skillName));
}

export function getSkillConfigDefinition(
    skillName: ConfigurableBundledSkillName,
    key: string,
): SkillConfigDefinition {
    return getSkillConfigDefinitions(skillName)[key]!;
}

export function getSkillConfigValue(
    settings: AppSettings,
    skillName: ConfigurableBundledSkillName,
    key: string,
): string {
    return getSkillConfigDefinition(skillName, key).getValue(settings);
}

export function listSkillConfigValues(
    settings: AppSettings,
    skillName: ConfigurableBundledSkillName,
): string[] {
    return getSkillConfigKeyChoices(skillName).map(
        key => `${key}=${getSkillConfigValue(settings, skillName, key)}`,
    );
}

export function getSkillConfigDefinitionByRawInput(
    rawSkillName: unknown,
    rawKey: unknown,
): SkillConfigDefinition | undefined {
    if (!isBundledSkillName(rawSkillName) || typeof rawKey !== "string") {
        return undefined;
    }

    const definitions = getSkillConfigDefinitions(rawSkillName);

    if (!(rawKey in definitions)) {
        return undefined;
    }

    return definitions[rawKey];
}

function getSkillConfigDefinitions(
    skillName: ConfigurableBundledSkillName,
): Record<string, SkillConfigDefinition> {
    return skillConfigDefinitions[skillName];
}
