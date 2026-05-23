import type { CliOptionDefinition, Writer } from "../contracts/cli.ts";

export const JSON_OUTPUT_SCHEMA_VERSION = "1.0.0";

export const jsonOutputOptions = [
    {
        name: "format",
        longFlag: "--format",
        valueName: "format",
        descriptionKey: "options.format",
    },
    {
        name: "json",
        longFlag: "--json",
        descriptionKey: "options.json",
        implies: {
            format: "json",
        },
    },
    {
        name: "showSchemaVersion",
        longFlag: "--show-schema-version",
        descriptionKey: "options.showSchemaVersion",
    },
] as const satisfies readonly CliOptionDefinition[];

export interface WriteJsonOutputOptions {
    showSchemaVersion?: boolean | undefined;
}

export function writeJsonOutput(
    writer: Writer,
    value: unknown,
    options: WriteJsonOutputOptions = {},
): void {
    writer.write(`${JSON.stringify(applySchemaVersion(value, options))}\n`);
}

function applySchemaVersion(
    value: unknown,
    options: WriteJsonOutputOptions,
): unknown {
    if (options.showSchemaVersion !== true) {
        return value;
    }

    if (Array.isArray(value)) {
        return {
            schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
            items: value,
        };
    }

    if (value !== null && typeof value === "object") {
        const { schemaVersion: _ignored, ...rest } = value as Record<string, unknown>;

        return {
            schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
            ...rest,
        };
    }

    return {
        schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
        value,
    };
}
