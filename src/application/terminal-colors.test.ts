import { describe, expect, test } from "bun:test";

import { createTerminalColors } from "./terminal-colors.ts";

describe("terminal colors", () => {
    test("matches ansis escape sequences for basic named colors", () => {
        const colors = createTerminalColors(true);

        expect(colors.red("x")).toBe("\u001B[31mx\u001B[39m");
        expect(colors.green("x")).toBe("\u001B[32mx\u001B[39m");
        expect(colors.yellow("x")).toBe("\u001B[33mx\u001B[39m");
        expect(colors.blue("x")).toBe("\u001B[34mx\u001B[39m");
        expect(colors.magenta("x")).toBe("\u001B[35mx\u001B[39m");
        expect(colors.cyan("x")).toBe("\u001B[36mx\u001B[39m");
    });

    test("preserves chained intensity modifiers", () => {
        const colors = createTerminalColors(true);

        expect(colors.green.bold("x")).toBe("\u001B[32m\u001B[1mx\u001B[22m\u001B[39m");
        expect(colors.yellow.dim("x")).toBe("\u001B[33m\u001B[2mx\u001B[22m\u001B[39m");
    });

    test("keeps hex colors on truecolor output", () => {
        const colors = createTerminalColors(true);

        expect(colors.hex("#59F78D")("x")).toBe("\u001B[38;2;89;247;141mx\u001B[39m");
    });
});
