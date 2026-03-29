import type { ZodType } from "zod";
import type { AppSettings } from "../../../schemas/settings.ts";
import type { BundledSkillName } from "../embedded-assets.ts";

import { z } from "zod";
import { CliUserError } from "../../../contracts/cli.ts";
import {
    booleanConfigValueChoices,
    booleanConfigValueSchema,
    getOoSkillImplicitInvocation,
    parseBooleanConfigValue,
    setOoSkillImplicitInvocation,
    stringifyBooleanConfigValue,
} from "../../../schemas/settings.ts";
import {
    availableBundledSkillNames,
} from "../embedded-assets.ts";

interface SkillConfigDefinition {
    createInvalidValueError: (
        skillName: BundledSkillName,
        rawValue: unknown,
    ) => CliUserError;
    getValue: (settings: AppSettings) => string;
    setValue: (settings: AppSettings, value: string) => AppSettings;
    valueChoices: readonly string[];
    valueSchema: ZodType<string>;
}

function defineSkillConfigDefinition(
    definition: SkillConfigDefinition,
): SkillConfigDefinition {
    return definition;
}

const skillConfigDefinitions: Record<
    BundledSkillName,
    Record<string, SkillConfigDefinition>
> = {
    oo: {
        "allow-implicit-invocation": defineSkillConfigDefinition({
            createInvalidValueError(skillName, rawValue) {
                return new CliUserError(
                    "errors.skills.config.invalidAllowImplicitInvocationValue",
                    2,
                    {
                        skill: skillName,
                        value: String(rawValue ?? ""),
                    },
                );
            },
            getValue(settings) {
                return stringifyBooleanConfigValue(
                    getOoSkillImplicitInvocation(settings),
                );
            },
            setValue(settings, value) {
                return setOoSkillImplicitInvocation(
                    settings,
                    parseBooleanConfigValue(
                        booleanConfigValueSchema.parse(value),
                    ),
                );
            },
            valueChoices: booleanConfigValueChoices,
            valueSchema: booleanConfigValueSchema,
        }),
    },
};

export type SkillConfigSkillName = BundledSkillName;

export const skillConfigSkillChoices = availableBundledSkillNames;
export const skillConfigSkillSchema = z.enum(skillConfigSkillChoices);

export function isSkillConfigSkillName(value: unknown): value is SkillConfigSkillName {
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
    const skillName = isSkillConfigSkillName(rawInput.skill)
        ? rawInput.skill
        : skillConfigSkillChoices[0];

    return new CliUserError("errors.skills.config.invalidKey", 2, {
        choices: getSkillConfigKeyChoices(skillName).join(", "),
        skill: String(rawInput.skill ?? ""),
        value: String(rawInput.key ?? ""),
    });
}

export function getSkillConfigKeyChoices(
    skillName: SkillConfigSkillName,
): readonly string[] {
    return Object.keys(getSkillConfigDefinitions(skillName));
}

export function getSkillConfigDefinition(
    skillName: SkillConfigSkillName,
    key: string,
): SkillConfigDefinition {
    return getSkillConfigDefinitions(skillName)[key]!;
}

export function getSkillConfigValue(
    settings: AppSettings,
    skillName: SkillConfigSkillName,
    key: string,
): string {
    return getSkillConfigDefinition(skillName, key).getValue(settings);
}

export function listSkillConfigValues(
    settings: AppSettings,
    skillName: SkillConfigSkillName,
): string[] {
    return getSkillConfigKeyChoices(skillName).map(
        key => `${key}=${getSkillConfigValue(settings, skillName, key)}`,
    );
}

export function getSkillConfigDefinitionByRawInput(
    rawSkillName: unknown,
    rawKey: unknown,
): SkillConfigDefinition | undefined {
    if (!isSkillConfigSkillName(rawSkillName) || typeof rawKey !== "string") {
        return undefined;
    }

    const definitions = getSkillConfigDefinitions(rawSkillName);

    if (!(rawKey in definitions)) {
        return undefined;
    }

    return definitions[rawKey];
}

function getSkillConfigDefinitions(
    skillName: SkillConfigSkillName,
): Record<string, SkillConfigDefinition> {
    return skillConfigDefinitions[skillName];
}
