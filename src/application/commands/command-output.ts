import type {
    CliCommandOutputMode,
    CliOptionDefinition,
    CommandOutput,
    Writer,
} from "../contracts/cli.ts";

import { CliUserError } from "../contracts/cli.ts";

export const JSON_OUTPUT_SCHEMA_VERSION = "1.0.0";

export const outputFormatOptions = [
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

export interface OutputOptionValues {
    format?: unknown;
    json?: unknown;
    showSchemaVersion?: unknown;
}

const outputFormatValues = ["json"] as const;

/**
 * The one --json/--format precedence rule, shared by the telemetry event and
 * createCommandOutput. Lenient: an invalid --format value resolves to "text";
 * strict rejection is createCommandOutput's job.
 */
export function resolveOutputFormat(
    optionValues: OutputOptionValues,
): "json" | "text" {
    return optionValues.format === "json" || optionValues.json === true
        ? "json"
        : "text";
}

/**
 * Builds the per-invocation output handle handed to command handlers.
 *
 * Without a mode the handle is inert: no validation, text format, regardless of
 * any format/json keys present in the option values (commands without a declared
 * output mode never opt into the contract, and parent-command options may leak
 * into child invocations via optsWithGlobals). With a mode, an invalid --format
 * value throws the shared invalid-format error before any command work runs;
 * "json-only" pins the format to "json" while still validating the flags.
 */
export function createCommandOutput(
    writer: Writer,
    optionValues: OutputOptionValues,
    mode: CliCommandOutputMode | undefined,
): CommandOutput {
    const format = mode === undefined
        ? "text"
        : resolveStrictOutputFormat(optionValues, mode);
    const showSchemaVersion = optionValues.showSchemaVersion === true;

    const emitJson = (payload: unknown): void => {
        writeJsonOutput(writer, payload, { showSchemaVersion });
    };

    return {
        format,
        emit: (payload, renderText) => {
            if (format === "json") {
                emitJson(payload);
                return;
            }

            renderText();
        },
        emitJson,
    };
}

function resolveStrictOutputFormat(
    optionValues: OutputOptionValues,
    mode: CliCommandOutputMode,
): "json" | "text" {
    const format = optionValues.format;

    if (
        format !== undefined
        && !outputFormatValues.includes(format as (typeof outputFormatValues)[number])
    ) {
        throw new CliUserError("errors.shared.invalidFormat", 2, {
            value: String(format),
        });
    }

    return mode === "json-only" ? "json" : resolveOutputFormat(optionValues);
}

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
