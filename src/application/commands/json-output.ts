import type { CliOptionDefinition, Writer } from "../contracts/cli.ts";

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

export function writeJsonOutput(
    writer: Writer,
    value: unknown,
): void {
    const serialized = JSON.stringify(value);

    if (serialized === undefined) {
        throw new Error("JSON output value must be serializable.");
    }

    writer.write(`${serialized}\n`);
}
