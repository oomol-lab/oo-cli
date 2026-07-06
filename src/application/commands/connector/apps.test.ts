import { describe, expect, test } from "bun:test";

import { createTerminalColors } from "../../terminal-colors.ts";
import { formatConnectorAppsAsText } from "./apps.ts";

type ConnectorAppRow = Parameters<typeof formatConnectorAppsAsText>[0][number];

const greenOpenCode = "[32m";
const yellowOpenCode = "[33m";
const redOpenCode = "[31m";

describe("formatConnectorAppsAsText", () => {
    test("color-codes an active status, the service, and the default marker", () => {
        const output = formatConnectorAppsAsText(
            [sampleApp({ isDefault: true, service: "gmail", status: "active" })],
            "all",
            createTranslatorStub(),
            createTerminalColors(true),
        );

        expect(output).toContain("[");
        expect(output).toContain(greenOpenCode);
        expect(output).toContain("✓");
        expect(output).toContain("gmail");
    });

    test("colors a reauth-required status yellow and an error status red", () => {
        const colors = createTerminalColors(true);
        const reauth = formatConnectorAppsAsText(
            [sampleApp({ status: "reauth_required" })],
            "service",
            createTranslatorStub(),
            colors,
        );
        const errored = formatConnectorAppsAsText(
            [sampleApp({ status: "error" })],
            "service",
            createTranslatorStub(),
            colors,
        );

        expect(reauth).toContain(yellowOpenCode);
        expect(errored).toContain(redOpenCode);
    });

    test("aligns columns as plain text without escape sequences when colors are disabled", () => {
        const output = formatConnectorAppsAsText(
            [
                sampleApp({ displayName: "Work Gmail", service: "gmail" }),
                sampleApp({
                    connectionName: null,
                    displayName: "Linear",
                    isDefault: false,
                    service: "x",
                }),
            ],
            "all",
            createTranslatorStub(),
            createTerminalColors(false),
        );
        const lines = output.split("\n");

        expect(output).not.toContain("[");
        // Different service-name widths are padded to a shared column width, so
        // the following column lines up across rows.
        expect(lines[1]!.indexOf("Work Gmail")).toBe(lines[2]!.indexOf("Linear"));
        // A missing connection name and a non-default app both render a dash.
        expect(output).toContain("-");
    });

    test("returns the no-connections message for an empty all-scope listing", () => {
        const output = formatConnectorAppsAsText(
            [],
            "all",
            createTranslatorStub(),
            createTerminalColors(false),
        );

        expect(output).toBe("connector.apps.text.noConnections");
    });

    test("returns the per-service no-results message for an empty service-scope listing", () => {
        const output = formatConnectorAppsAsText(
            [],
            "service",
            createTranslatorStub(),
            createTerminalColors(false),
        );

        expect(output).toBe("connector.apps.text.noResults");
    });
});

function sampleApp(overrides: Partial<ConnectorAppRow> = {}): ConnectorAppRow {
    return {
        accountLabel: "user@example.com",
        authType: "oauth2",
        connectionName: "work",
        displayName: "Work Gmail",
        isDefault: true,
        scopes: [],
        service: "gmail",
        status: "active",
        ...overrides,
    };
}

function createTranslatorStub(): { t: (key: string) => string } {
    return { t: key => key };
}
