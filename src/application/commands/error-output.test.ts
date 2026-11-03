import { describe, expect, test } from "bun:test";
import { createTextBuffer } from "../../../__tests__/helpers.ts";
import { createTranslator } from "../../i18n/translator.ts";
import { CliUserError } from "../contracts/cli.ts";
import {
    createCliErrorReport,
    resolveErrorOutputFormatFromArgv,
    writeCliError,
} from "./error-output.ts";

describe("createCliErrorReport", () => {
    const translator = createTranslator("en");

    test("derives the code from the message key and keeps details", () => {
        const report = createCliErrorReport(
            new CliUserError("errors.auth.required", 1, undefined, {
                details: { httpStatus: 401 },
            }),
            translator,
        );

        expect(report).toEqual({
            code: "auth.required",
            details: { httpStatus: 401 },
            exitCode: 1,
            message: "You must log in before using this command.",
        });
    });

    test("prefers an explicit code over the message key", () => {
        const report = createCliErrorReport(
            new CliUserError("errors.auth.required", 1, undefined, {
                code: "custom.code",
            }),
            translator,
        );

        expect(report.code).toBe("custom.code");
        expect(report.details).toBeUndefined();
    });

    test("reports unknown failures as unexpected errors", () => {
        const report = createCliErrorReport(new Error("boom"), translator);

        expect(report).toEqual({
            code: "unexpected",
            exitCode: 1,
            message: "Unexpected error: boom",
        });
    });
});

describe("writeCliError", () => {
    test("writes the plain message in text mode", () => {
        const buffer = createTextBuffer();

        writeCliError(buffer.writer, {
            code: "auth.required",
            details: { httpStatus: 401 },
            exitCode: 1,
            message: "Login required",
        }, "text");

        expect(buffer.read()).toBe("Login required\n");
    });

    test("writes a single-line JSON envelope in json mode", () => {
        const buffer = createTextBuffer();

        writeCliError(buffer.writer, {
            code: "auth.required",
            details: { httpStatus: 401 },
            exitCode: 1,
            message: "Login\nrequired",
        }, "json");

        const output = buffer.read();

        expect(output.endsWith("\n")).toBe(true);
        expect(output.trimEnd().includes("\n")).toBe(false);
        expect(JSON.parse(output)).toEqual({
            error: {
                code: "auth.required",
                details: { httpStatus: 401 },
                exitCode: 1,
                message: "Login\nrequired",
            },
        });
    });

    test("omits details when the report has none", () => {
        const buffer = createTextBuffer();

        writeCliError(buffer.writer, {
            code: "unexpected",
            exitCode: 1,
            message: "Unexpected error: boom",
        }, "json");

        expect(JSON.parse(buffer.read())).toEqual({
            error: {
                code: "unexpected",
                exitCode: 1,
                message: "Unexpected error: boom",
            },
        });
    });
});

describe("resolveErrorOutputFormatFromArgv", () => {
    test("detects every JSON output flag form", () => {
        expect(resolveErrorOutputFormatFromArgv(["connector", "run", "--json"])).toBe("json");
        expect(resolveErrorOutputFormatFromArgv(["search", "--format=json"])).toBe("json");
        expect(resolveErrorOutputFormatFromArgv(["search", "--format", "json"])).toBe("json");
    });

    test("falls back to text without a JSON flag", () => {
        expect(resolveErrorOutputFormatFromArgv(["search", "mail"])).toBe("text");
        expect(resolveErrorOutputFormatFromArgv(["search", "--format", "yaml"])).toBe("text");
    });

    test("ignores arguments after the option terminator", () => {
        expect(resolveErrorOutputFormatFromArgv(["search", "--", "--json"])).toBe("text");
    });
});
