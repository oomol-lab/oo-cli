import { describe, expect, test } from "bun:test";

import { CliUserError } from "../contracts/cli.ts";
import {
    createCommandOutput,
    JSON_OUTPUT_SCHEMA_VERSION,
    resolveOutputFormat,
    writeJsonOutput,
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
                createCollectingWriter([]),
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
                createCollectingWriter([]),
                optionValues,
                "standard",
            );

            expect(output.format).toBe(expected as "json" | "text");
        });

        test("rejects an invalid --format value with the shared error", () => {
            expect(() => createCommandOutput(
                createCollectingWriter([]),
                { format: "yaml" },
                "standard",
            )).toThrow(CliUserError);

            try {
                createCommandOutput(createCollectingWriter([]), { format: "yaml" }, "standard");
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
            const output = createCommandOutput(createCollectingWriter([]), {}, "json-only");

            expect(output.format).toBe("json");
        });

        test("accepts --format json", () => {
            const output = createCommandOutput(
                createCollectingWriter([]),
                { format: "json" },
                "json-only",
            );

            expect(output.format).toBe("json");
        });

        test("still rejects an invalid --format value", () => {
            expect(() => createCommandOutput(
                createCollectingWriter([]),
                { format: "yaml" },
                "json-only",
            )).toThrow(CliUserError);
        });
    });

    describe("emit", () => {
        test("writes the JSON payload and skips renderText in json mode", () => {
            const chunks: string[] = [];
            const output = createCommandOutput(
                createCollectingWriter(chunks),
                { format: "json" },
                "standard",
            );
            let textRendered = false;

            output.emit({ ok: true }, () => {
                textRendered = true;
            });

            expect(chunks.join("")).toBe(`{"ok":true}\n`);
            expect(textRendered).toBe(false);
        });

        test("calls renderText and writes no JSON in text mode", () => {
            const chunks: string[] = [];
            const output = createCommandOutput(
                createCollectingWriter(chunks),
                {},
                "standard",
            );
            let textRendered = false;

            output.emit({ ok: true }, () => {
                textRendered = true;
            });

            expect(chunks).toEqual([]);
            expect(textRendered).toBe(true);
        });
    });

    describe("emitJson", () => {
        test("applies the schemaVersion envelope captured from the options", () => {
            const chunks: string[] = [];
            const output = createCommandOutput(
                createCollectingWriter(chunks),
                { format: "json", showSchemaVersion: true },
                "standard",
            );

            output.emitJson({ taskID: "task-1" });

            expect(JSON.parse(chunks.join(""))).toEqual({
                schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
                taskID: "task-1",
            });
        });

        test("wraps array payloads under items when the envelope is on", () => {
            const chunks: string[] = [];
            const output = createCommandOutput(
                createCollectingWriter(chunks),
                { json: true, showSchemaVersion: true },
                "standard",
            );

            output.emitJson([1, 2]);

            expect(JSON.parse(chunks.join(""))).toEqual({
                schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
                items: [1, 2],
            });
        });

        test("writes bare JSON without --show-schema-version", () => {
            const chunks: string[] = [];
            const output = createCommandOutput(
                createCollectingWriter(chunks),
                { format: "json" },
                "standard",
            );

            output.emitJson([1, 2]);

            expect(chunks.join("")).toBe(`[1,2]\n`);
        });

        test("ignores a non-boolean showSchemaVersion value", () => {
            const chunks: string[] = [];
            const output = createCommandOutput(
                createCollectingWriter(chunks),
                { format: "json", showSchemaVersion: "yes" },
                "standard",
            );

            output.emitJson({ ok: true });

            expect(chunks.join("")).toBe(`{"ok":true}\n`);
        });
    });
});

describe("writeJsonOutput", () => {
    test("emits compact JSON with a trailing newline by default", () => {
        const chunks: string[] = [];
        const writer = createCollectingWriter(chunks);

        writeJsonOutput(writer, { taskID: "task-1" });

        expect(chunks.join("")).toBe(`{"taskID":"task-1"}\n`);
    });

    test("omits schemaVersion when showSchemaVersion is not set", () => {
        const chunks: string[] = [];
        const writer = createCollectingWriter(chunks);

        writeJsonOutput(writer, { taskID: "task-1" }, {
            showSchemaVersion: false,
        });

        expect(chunks.join("")).toBe(`{"taskID":"task-1"}\n`);
    });

    test("merges schemaVersion into object payloads", () => {
        const chunks: string[] = [];
        const writer = createCollectingWriter(chunks);

        writeJsonOutput(writer, { taskID: "task-1" }, {
            showSchemaVersion: true,
        });

        expect(JSON.parse(chunks.join(""))).toEqual({
            schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
            taskID: "task-1",
        });
    });

    test("places schemaVersion before object properties", () => {
        const chunks: string[] = [];
        const writer = createCollectingWriter(chunks);

        writeJsonOutput(writer, { taskID: "task-1" }, {
            showSchemaVersion: true,
        });

        expect(chunks.join("")).toBe(
            `{"schemaVersion":"${JSON_OUTPUT_SCHEMA_VERSION}","taskID":"task-1"}\n`,
        );
    });

    test("wraps array payloads under items", () => {
        const chunks: string[] = [];
        const writer = createCollectingWriter(chunks);

        writeJsonOutput(writer, [1, 2, 3], { showSchemaVersion: true });

        expect(JSON.parse(chunks.join(""))).toEqual({
            schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
            items: [1, 2, 3],
        });
    });

    test("forces schemaVersion to override any existing field on objects", () => {
        const chunks: string[] = [];
        const writer = createCollectingWriter(chunks);

        writeJsonOutput(writer, { schemaVersion: "2.0.0", value: 1 }, {
            showSchemaVersion: true,
        });

        expect(JSON.parse(chunks.join(""))).toEqual({
            schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
            value: 1,
        });
    });

    test("wraps primitive payloads under value", () => {
        const chunks: string[] = [];
        const writer = createCollectingWriter(chunks);

        writeJsonOutput(writer, null, { showSchemaVersion: true });

        expect(JSON.parse(chunks.join(""))).toEqual({
            schemaVersion: JSON_OUTPUT_SCHEMA_VERSION,
            value: null,
        });
    });
});

function createCollectingWriter(chunks: string[]): { write: (chunk: string) => void } {
    return {
        write: (chunk: string) => {
            chunks.push(chunk);
        },
    };
}
