import { describe, expect, test } from "bun:test";

import { createTerminalColors } from "../../terminal-colors.ts";
import { formatTeamsAsText } from "./list.ts";

type TeamListRow = Parameters<typeof formatTeamsAsText>[0][number];

const greenOpenCode = "[32m";

describe("formatTeamsAsText", () => {
    test("marks the current default team with a green check", () => {
        const output = formatTeamsAsText(
            [sampleTeam({ current: true, name: "acme", role: "creator" })],
            createTranslatorStub(),
            createTerminalColors(true),
        );

        expect(output).toContain(greenOpenCode);
        expect(output).toContain("✓");
        expect(output).toContain("acme");
        expect(output).toContain("creator");
    });

    test("aligns columns as plain text without escape sequences when colors are disabled", () => {
        const output = formatTeamsAsText(
            [
                sampleTeam({ current: true, name: "acme", role: "creator" }),
                sampleTeam({ current: false, name: "beta", role: "member" }),
            ],
            createTranslatorStub(),
            createTerminalColors(false),
        );
        const lines = output.split("\n");

        expect(output).not.toContain("[");
        // The non-current team renders a dash in the default column.
        expect(output).toContain("-");
        // The role column lines up across rows because the team column
        // is padded to a shared width.
        expect(lines[1]!.indexOf("creator")).toBe(lines[2]!.indexOf("member"));
    });

    test("pads wide CJK team names by display width so later columns stay aligned", () => {
        const output = formatTeamsAsText(
            [
                sampleTeam({ name: "钉钉", role: "creator" }),
                sampleTeam({ name: "AB", role: "member" }),
            ],
            createTranslatorStub(),
            createTerminalColors(false),
        );
        const lines = output.split("\n");
        const displayWidthBeforeRole = (line: string, role: string): number =>
            Bun.stringWidth(line.slice(0, line.indexOf(role)));

        expect(displayWidthBeforeRole(lines[1]!, "creator")).toBe(
            displayWidthBeforeRole(lines[2]!, "member"),
        );
    });

    test("returns the empty-listing message when there are no teams", () => {
        const output = formatTeamsAsText(
            [],
            createTranslatorStub(),
            createTerminalColors(false),
        );

        expect(output).toBe("team.list.text.noTeams");
    });
});

function sampleTeam(overrides: Partial<TeamListRow> = {}): TeamListRow {
    return {
        current: false,
        id: "team-1",
        name: "acme",
        role: "member",
        ...overrides,
    };
}

function createTranslatorStub(): { t: (key: string) => string } {
    return { t: key => key };
}
