import { describe, expect, test } from "bun:test";

import { createTerminalColors } from "../../terminal-colors.ts";
import { formatTextTable } from "./text-table.ts";

interface Row {
    name: string;
    role: string;
}

const columns = [
    { header: "Name", render: (row: Row) => row.name },
    { header: "Role", render: (row: Row) => row.role },
];

describe("formatTextTable", () => {
    test("pads every cell except the last to its column width", () => {
        const output = formatTextTable(columns, [
            { name: "alpha", role: "owner" },
            { name: "b", role: "member" },
        ], createTerminalColors(false));

        expect(output.split("\n")).toEqual([
            "Name   Role",
            "alpha  owner",
            "b      member",
        ]);
    });

    test("measures wide glyphs as two columns", () => {
        const output = formatTextTable(columns, [
            { name: "团队", role: "owner" },
            { name: "abcd", role: "member" },
        ], createTerminalColors(false));

        expect(output.split("\n")).toEqual([
            "Name  Role",
            "团队  owner",
            "abcd  member",
        ]);
    });

    test("ignores ANSI escapes when measuring", () => {
        const colors = createTerminalColors(true);
        const output = formatTextTable(columns, [
            { name: "alpha", role: "owner" },
            { name: "b", role: "member" },
        ], colors);
        const plainLines = Bun.stripANSI(output).split("\n");

        expect(plainLines).toEqual([
            "Name   Role",
            "alpha  owner",
            "b      member",
        ]);
        expect(output).not.toBe(Bun.stripANSI(output));
    });

    test("renders the header alone when there are no rows", () => {
        const output = formatTextTable(columns, [], createTerminalColors(false));

        expect(output).toBe("Name  Role");
    });
});
