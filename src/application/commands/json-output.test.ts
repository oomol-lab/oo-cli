import { describe, expect, test } from "bun:test";

import { JSON_OUTPUT_SCHEMA_VERSION, writeJsonOutput } from "./json-output.ts";

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
