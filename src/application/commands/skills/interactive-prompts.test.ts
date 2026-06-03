import { describe, expect, test } from "bun:test";

import {
    createInteractiveInput,
    createTextBuffer,
} from "../../../../__tests__/helpers.ts";
import {
    confirmInteractiveValue,
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
});
