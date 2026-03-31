import { describe, expect, test } from "bun:test";

import {
    moveCursorUp,
    rewriteTerminalLine,
    rewriteTerminalLines,
} from "./terminal-control.ts";

describe("terminal control", () => {
    test("formats cursor-up sequences for non-negative line counts", () => {
        expect(moveCursorUp(0)).toBe("");
        expect(moveCursorUp(3)).toBe("\u001B[3A");
        expect(() => moveCursorUp(-1)).toThrow(
            "lineCount must be a non-negative integer.",
        );
        expect(() => moveCursorUp(1.5)).toThrow(
            "lineCount must be a non-negative integer.",
        );
    });

    test("rewrites one or more rendered lines with carriage return and clear line", () => {
        expect(rewriteTerminalLine("Downloading")).toBe("\r\u001B[2KDownloading");
        expect(rewriteTerminalLines(["first", "second"])).toBe(
            "\r\u001B[2Kfirst\n\r\u001B[2Ksecond",
        );
    });
});
