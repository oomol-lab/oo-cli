import type { CliOptionDefinition } from "../contracts/cli.ts";

export const jsonFormatOption = {
    name: "format",
    longFlag: "--format",
    valueName: "format",
    descriptionKey: "options.format",
} as const satisfies CliOptionDefinition;

export const jsonAliasOption = {
    name: "json",
    longFlag: "--json",
    descriptionKey: "options.json",
    implies: {
        format: "json",
    },
} as const satisfies CliOptionDefinition;

export const jsonOutputOptions = [
    jsonFormatOption,
    jsonAliasOption,
] as const satisfies readonly CliOptionDefinition[];
