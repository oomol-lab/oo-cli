import type { CliErrorDetails, Writer } from "../contracts/cli.ts";
import type { Translator } from "../contracts/translator.ts";

import { CliUserError } from "../contracts/cli.ts";

export type CliErrorOutputFormat = "json" | "text";

export interface CliErrorReport {
    code: string;
    details?: CliErrorDetails;
    exitCode: number;
    message: string;
}

const unexpectedErrorCode = "unexpected";

/**
 * Reduces any thrown value to the report shared by text and JSON error output.
 * The message is the same localized text the text mode prints.
 */
export function createCliErrorReport(
    error: unknown,
    translator: Translator,
): CliErrorReport {
    if (error instanceof CliUserError) {
        return {
            code: error.code,
            details: error.details,
            exitCode: error.exitCode,
            message: translator.t(error.key, error.params),
        };
    }

    return {
        code: unexpectedErrorCode,
        exitCode: 1,
        message: translator.t("errors.unexpected", {
            message: error instanceof Error ? error.message : String(error),
        }),
    };
}

/**
 * Writes a failure to stderr. Text mode keeps the plain localized line; JSON
 * mode writes one `{ "error": { code, message, exitCode, details? } }` line so
 * programmatic callers never parse localized prose.
 */
export function writeCliError(
    writer: Writer,
    report: CliErrorReport,
    format: CliErrorOutputFormat,
): void {
    if (format === "text") {
        writer.write(`${report.message}\n`);
        return;
    }

    writer.write(`${JSON.stringify({
        error: {
            code: report.code,
            message: report.message,
            exitCode: report.exitCode,
            ...(report.details === undefined ? {} : { details: report.details }),
        },
    })}\n`);
}

/**
 * Detects a JSON output request from raw argv. Used only for failures that
 * happen before a command resolves its own output format (parse errors,
 * bootstrap errors); arguments after `--` are never inspected.
 */
export function resolveErrorOutputFormatFromArgv(
    argv: readonly string[],
): CliErrorOutputFormat {
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];

        if (argument === "--") {
            return "text";
        }

        if (
            argument === "--json"
            || argument === "--format=json"
            || (argument === "--format" && argv[index + 1] === "json")
        ) {
            return "json";
        }
    }

    return "text";
}
