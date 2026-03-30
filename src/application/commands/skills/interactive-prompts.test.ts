import { stripVTControlCharacters } from "node:util";

import { describe, expect, test } from "bun:test";

import {
    createInteractiveInput,
    createTextBuffer,
    waitForOutputText,
} from "../../../../__tests__/helpers.ts";
import {
    confirmInteractiveValue,
    selectInteractiveSkills,
} from "./interactive-prompts.ts";

describe("interactive prompts", () => {
    test("accepts yes/no confirmation input", async () => {
        const stdin = createInteractiveInput();
        const stdout = createTextBuffer({
            isTTY: true,
        });
        const confirmationPromise = confirmInteractiveValue(
            {
                stdin,
                stdout: stdout.writer,
            },
            {
                invalidMessage: "invalid",
                prompt: "Overwrite? [y/N] ",
            },
        );

        stdin.feed("yes\n");

        await expect(confirmationPromise).resolves.toBeTrue();
        expect(stdout.read()).toBe("Overwrite? [y/N] ");
    });

    test("re-prompts on invalid confirmation input", async () => {
        const stdin = createInteractiveInput();
        const stdout = createTextBuffer({
            isTTY: true,
        });
        const confirmationPromise = confirmInteractiveValue(
            {
                stdin,
                stdout: stdout.writer,
            },
            {
                invalidMessage: "invalid",
                prompt: "Overwrite? [y/N] ",
            },
        );

        stdin.feed("maybe\n");
        stdin.feed("n\n");

        await expect(confirmationPromise).resolves.toBeFalse();
        expect(stdout.read()).toBe("Overwrite? [y/N] invalid\nOverwrite? [y/N] ");
    });

    test("renders a clack-style multiselect prompt", async () => {
        const stdin = createInteractiveInput();
        const stdout = createTextBuffer({
            isTTY: true,
        });
        const selectionPromise = selectInteractiveSkills(
            {
                stdin,
                stdout: stdout.writer,
            },
            {
                items: [
                    {
                        description: "First description",
                        name: "alpha",
                        title: "Alpha",
                    },
                    {
                        description: "Second description",
                        name: "beta",
                        statusLabel: "conflict",
                        title: "Beta",
                    },
                ],
                prompt: "Select skills to install or keep installed (space to toggle)",
            },
        );

        await waitForOutputText(stdout, "Select skills to install or keep installed");
        stdin.feed(" ");
        stdin.feed("\r");

        await expect(selectionPromise).resolves.toEqual(["alpha"]);
        const plainOutput = stripVTControlCharacters(stdout.read());

        expect(plainOutput).toContain("◇ Select skills to install or keep installed");
        expect(plainOutput).toContain("◆ Select skills to install or keep installed");
        expect(plainOutput).toContain("Select skills to install or keep installed");
        expect(plainOutput).toContain("alpha");
        expect(plainOutput).toContain("beta");
        expect(plainOutput).toContain("conflict");
        expect(plainOutput).toContain("First description");
    });

    test("preselects installed skills without rendering a right-side status label", async () => {
        const stdin = createInteractiveInput();
        const stdout = createTextBuffer({
            isTTY: true,
        });
        const selectionPromise = selectInteractiveSkills(
            {
                stdin,
                stdout: stdout.writer,
            },
            {
                items: [
                    {
                        description: "Already installed",
                        name: "alpha",
                        selected: true,
                        title: "Alpha",
                    },
                    {
                        description: "Needs confirmation",
                        name: "beta",
                        statusLabel: "conflict",
                        title: "Beta",
                    },
                ],
                prompt: "Select skills to install or keep installed (space to toggle)",
            },
        );

        await waitForOutputText(stdout, "Select skills to install or keep installed");
        stdin.feed("\r");

        await expect(selectionPromise).resolves.toEqual(["alpha"]);
        const plainOutput = stripVTControlCharacters(stdout.read()).replaceAll(
            "\u200B",
            "",
        );

        expect(plainOutput).toContain("◆ Select skills to install or keep installed");
        expect(plainOutput).toContain("\n ◼ alpha");
        expect(plainOutput).not.toContain("alpha  installed");
        expect(plainOutput).toContain("beta");
        expect(plainOutput).toContain("conflict");
    });

    test("uses project terminal colors for the multiselect prompt", async () => {
        const stdin = createInteractiveInput();
        const stdout = createTextBuffer({
            hasColors: true,
            isTTY: true,
        });
        const selectionPromise = selectInteractiveSkills(
            {
                stdin,
                stdout: stdout.writer,
            },
            {
                items: [
                    {
                        description: "First description",
                        name: "alpha",
                        title: "Alpha",
                    },
                ],
                prompt: "Select skills to install or keep installed",
            },
        );

        await waitForOutputText(stdout, "Select skills to install or keep installed");
        stdin.feed("\r");

        await expect(selectionPromise).resolves.toEqual([]);

        const renderedOutput = stdout.read();
        const plainOutput = stripVTControlCharacters(renderedOutput).replaceAll("\u200B", "");

        expect(renderedOutput).not.toContain("\u001B[36m◆\u001B[39m");
        expect(renderedOutput).not.toContain("\u001B[90m│\u001B[39m");
        expect(renderedOutput).not.toContain("\u001B[36m│\u001B[39m");
        expect(plainOutput).toContain("\n ◻ alpha");
    });

    test("truncates long option descriptions to avoid wrapped prompt rows", async () => {
        const columnsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "columns");
        const rowsDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "rows");

        Object.defineProperty(process.stdout, "columns", {
            configurable: true,
            value: 90,
        });
        Object.defineProperty(process.stdout, "rows", {
            configurable: true,
            value: 12,
        });

        try {
            const stdin = createInteractiveInput();
            const stdout = createTextBuffer({
                hasColors: true,
                isTTY: true,
            });
            const selectionPromise = selectInteractiveSkills(
                {
                    stdin,
                    stdout: stdout.writer,
                },
                {
                    items: [
                        {
                            description: "Adapt UI for different contexts, screen sizes, and user needs with responsive behavior and layout changes",
                            name: "adapt",
                            title: "Adapt",
                        },
                    ],
                    prompt: "Select skills to install or keep installed",
                },
            );

            await waitForOutputText(
                stdout,
                "Select skills to install or keep installed",
            );

            const plainOutput = stripVTControlCharacters(stdout.read());

            expect(plainOutput).toContain("...");
            expect(plainOutput).not.toContain("behavior and layout changes");

            stdin.feed("\r");
            await expect(selectionPromise).resolves.toEqual([]);
        }
        finally {
            if (columnsDescriptor) {
                Object.defineProperty(process.stdout, "columns", columnsDescriptor);
            }
            if (rowsDescriptor) {
                Object.defineProperty(process.stdout, "rows", rowsDescriptor);
            }
        }
    });
});
