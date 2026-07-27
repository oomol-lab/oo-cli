import { describe, expect, test } from "bun:test";

import { createTextBuffer } from "../../../__tests__/helpers.ts";
import { CliUserError } from "../contracts/cli.ts";
import {
    createCommandOutput,
    JSON_OUTPUT_SCHEMA_VERSION,
    resolveOutputFormat,
} from "./command-output.ts";

describe("resolveOutputFormat", () => {
    test.each([
        { expected: "text", optionValues: {}, title: "no options" },
        { expected: "json", optionValues: { format: "json" }, title: "--format json" },
        { expected: "json", optionValues: { json: true }, title: "--json" },
        {
            expected: "json",
            optionValues: { format: "yaml", json: true },
            title: "--json wins over an invalid --format value",
        },
        {
            expected: "text",
            optionValues: { format: "yaml" },
            title: "an invalid --format value resolves leniently to text",
        },
        { expected: "text", optionValues: { format: "" }, title: "an empty --format value" },
    ])("$title -> $expected", ({ expected, optionValues }) => {
        expect(resolveOutputFormat(optionValues)).toBe(expected as "json" | "text");
    });
});

describe("createCommandOutput", () => {
    describe("without an output mode (inert handle)", () => {
        test("resolves to text and never validates", () => {
            const output = createCommandOutput(
                createTextBuffer().writer,
                { format: "yaml", json: true },
                undefined,
            );

            expect(output.format).toBe("text");
        });
    });

    describe("standard mode", () => {
        test.each([
            { expected: "text", optionValues: {}, title: "defaults to text" },
            { expected: "json", optionValues: { format: "json" }, title: "--format json" },
            { expected: "json", optionValues: { json: true }, title: "--json" },
        ])("$title -> $expected", ({ expected, optionValues }) => {
            const output = createCommandOutput(
                createTextBuffer().writer,
                optionValues,
                "standard",
            );

            expect(output.format).toBe(expected as "json" | "text");
        });

        test("rejects an invalid --format value with the shared error", () => {
            expect(() => createCommandOutput(
                createTextBuffer().writer,
                { format: "yaml" },
                "standard",
            )).toThrow(CliUserError);

            try {
                createCommandOutput(createTextBuffer().writer, { format: "yaml" }, "standard");
            }
            catch (error) {
                expect(error).toBeInstanceOf(CliUserError);
                expect((error as CliUserError).key).toBe("errors.shared.invalidFormat");
                expect((error as CliUserError).exitCode).toBe(2);
                expect((error as CliUserError).params).toEqual({ value: "yaml" });
            }
        });
    });

    describe("json-only mode", () => {
        test("pins format to json without any flags", () => {
            const output = createCommandOutput(createTextBuffer().writer, {}, "json-only");

            expect(output.format).toBe("json");
        });

        test("accepts --format json", () => {
            const output = createCommandOutput(
                createTextBuffer().writer,
                { format: "json" },
                "json-only",
            );

            expect(output.format).toBe("json");
        });

        test("still rejects an invalid --format value", () => {
            expect(() => createCommandOutput(
                createTextBuffer().writer,
                { format: "yaml" },
                "json-only",
            )).toThrow(CliUserError);
        });
    });

    describe("emit", () => {
        test("writes the JSON payload and skips renderText in json mode", () => {
            const stdout = createTextBuffer();
            const output = createCommandOutput(
                stdout.writer,
                { format: "json" },
                "standard",
            );
            let textRendered = false;

            output.emit({ ok: true }, () => {
                textRendered = true;
            });

            expect(stdout.read()).toBe(`{"ok":true}\n`);
            expect(textRendered).toBe(false);
        });

        test("calls renderText and writes no JSON in text mode", () => {
            const stdout = createTextBuffer();
            const output = createCommandOutput(
                stdout.writer,
                {},
                "standard",
            );
            let textRendered = false;

            output.emit({ ok: true }, () => {
                textRendered = true;
            });

            expect(stdout.read()).toBe("");
            expect(textRendered).toBe(true);
        });
    });

    describe("emitJson", () => {
        test("applies the schemaVersion envelope captured from the options", () => {
            expect(JSON.parse(emitJsonThrough({ taskID: "task-1" }, {
                showSchemaVersion: true,
            }))).toEqual({
                schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
                taskID: "task-1",
            });
        });

        test("wraps array payloads under items when the envelope is on", () => {
            expect(JSON.parse(emitJsonThrough([1, 2], {
                json: true,
                showSchemaVersion: true,
            }))).toEqual({
                schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
                items: [1, 2],
            });
        });

        test("writes bare JSON without --show-schema-version", () => {
            expect(emitJsonThrough([1, 2])).toBe(`[1,2]\n`);
        });

        test("ignores a non-boolean showSchemaVersion value", () => {
            expect(emitJsonThrough({ ok: true }, { showSchemaVersion: "yes" }))
                .toBe(`{"ok":true}\n`);
        });
    });
});

describe("emitJson envelope", () => {
    test("emits compact JSON with a trailing newline by default", () => {
        expect(emitJsonThrough({ taskID: "task-1" })).toBe(`{"taskID":"task-1"}\n`);
    });

    test("omits schemaVersion when showSchemaVersion is false", () => {
        expect(emitJsonThrough({ taskID: "task-1" }, { showSchemaVersion: false }))
            .toBe(`{"taskID":"task-1"}\n`);
    });

    test("places schemaVersion before object properties", () => {
        expect(emitJsonThrough({ taskID: "task-1" }, { showSchemaVersion: true })).toBe(
            `{"schemaVersion":"${JSON_OUTPUT_SCHEMA_VERSION}","taskID":"task-1"}\n`,
        );
    });

    test("forces schemaVersion to override any existing field on objects", () => {
        expect(JSON.parse(emitJsonThrough({ schemaVersion: "2.0.0", value: 1 }, {
            showSchemaVersion: true,
        }))).toEqual({
            schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
            value: 1,
        });
    });

    test("wraps primitive payloads under value", () => {
        expect(JSON.parse(emitJsonThrough(null, { showSchemaVersion: true }))).toEqual({
            schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
            value: null,
        });
    });
});

function emitJsonThrough(
    payload: unknown,
    optionValues: { json?: unknown; showSchemaVersion?: unknown } = {},
): string {
    const stdout = createTextBuffer();

    createCommandOutput(
        stdout.writer,
        { format: "json", ...optionValues },
        "standard",
    ).emitJson(payload);

    return stdout.read();
}
