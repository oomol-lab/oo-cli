import { describe, expect, test } from "bun:test";

import { createTerminalColors } from "../../terminal-colors.ts";
import { formatOrganizationsAsText } from "./list.ts";

type OrgListRow = Parameters<typeof formatOrganizationsAsText>[0][number];

const greenOpenCode = "[32m";

describe("formatOrganizationsAsText", () => {
    test("marks the current default organization with a green check", () => {
        const output = formatOrganizationsAsText(
            [sampleOrg({ current: true, name: "acme", role: "creator" })],
            createTranslatorStub(),
            createTerminalColors(true),
        );

        expect(output).toContain(greenOpenCode);
        expect(output).toContain("✓");
        expect(output).toContain("acme");
        expect(output).toContain("creator");
    });

    test("aligns columns as plain text without escape sequences when colors are disabled", () => {
        const output = formatOrganizationsAsText(
            [
                sampleOrg({ current: true, name: "acme", role: "creator" }),
                sampleOrg({ current: false, name: "beta", role: "member" }),
            ],
            createTranslatorStub(),
            createTerminalColors(false),
        );
        const lines = output.split("\n");

        expect(output).not.toContain("[");
        // The non-current organization renders a dash in the default column.
        expect(output).toContain("-");
        // The role column lines up across rows because the organization column
        // is padded to a shared width.
        expect(lines[1]!.indexOf("creator")).toBe(lines[2]!.indexOf("member"));
    });

    test("pads wide CJK organization names by display width so later columns stay aligned", () => {
        const output = formatOrganizationsAsText(
            [
                sampleOrg({ name: "钉钉", role: "creator" }),
                sampleOrg({ name: "AB", role: "member" }),
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

    test("returns the empty-listing message when there are no organizations", () => {
        const output = formatOrganizationsAsText(
            [],
            createTranslatorStub(),
            createTerminalColors(false),
        );

        expect(output).toBe("org.list.text.noOrganizations");
    });
});

function sampleOrg(overrides: Partial<OrgListRow> = {}): OrgListRow {
    return {
        current: false,
        id: "org-1",
        name: "acme",
        role: "member",
        ...overrides,
    };
}

function createTranslatorStub(): { t: (key: string) => string } {
    return { t: key => key };
}
