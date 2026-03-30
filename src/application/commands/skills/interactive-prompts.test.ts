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
                prompt: "Select skills to install (space to toggle)",
            },
        );

        await waitForOutputText(stdout, "Select skills to install");
        stdin.feed(" ");
        stdin.feed("\r");

        await expect(selectionPromise).resolves.toEqual(["alpha"]);
        const plainOutput = stripVTControlCharacters(stdout.read());

        expect(plainOutput).toContain("Select skills to install");
        expect(plainOutput).toContain("alpha");
        expect(plainOutput).toContain("beta");
        expect(plainOutput).toContain("conflict");
        expect(plainOutput).toContain("First description");
    });
});
