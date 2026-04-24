import { describe, expect, test } from "bun:test";
import { createTextBuffer } from "../../../__tests__/helpers.ts";
import { createTranslator } from "../../i18n/translator.ts";
import { writeSelfUpdatePathNoteIfNeeded } from "./self-update-output.ts";

const translator = createTranslator("en");
const executableDirectory = "/home/demo/.local/bin";

describe("writeSelfUpdatePathNoteIfNeeded", () => {
    test("stays silent when env PATH already contains the directory", () => {
        const stdout = createTextBuffer();

        writeSelfUpdatePathNoteIfNeeded({
            executableDirectory,
            pathConfiguration: { status: "already-configured" },
            stdout: stdout.writer,
            translator,
        });

        expect(stdout.read()).toBe("");
    });

    test("prints the restart-shell note when a profile already had the marker but the current shell is stale", () => {
        const stdout = createTextBuffer();

        writeSelfUpdatePathNoteIfNeeded({
            executableDirectory,
            pathConfiguration: {
                status: "already-configured",
                target: ["/home/demo/.zshrc"],
            },
            stdout: stdout.writer,
            translator,
        });

        expect(stdout.read()).toBe(
            "Added /home/demo/.local/bin to PATH. Restart your shell to reload PATH and use oo.\n",
        );
    });

    test("prints the restart-shell note when PATH was freshly configured", () => {
        const stdout = createTextBuffer();

        writeSelfUpdatePathNoteIfNeeded({
            executableDirectory,
            pathConfiguration: {
                status: "configured",
                target: ["/home/demo/.zshrc"],
            },
            stdout: stdout.writer,
            translator,
        });

        expect(stdout.read()).toContain("Restart your shell");
    });

    test("prints a symmetric updated / failed listing on partial success", () => {
        const stdout = createTextBuffer();

        writeSelfUpdatePathNoteIfNeeded({
            executableDirectory,
            pathConfiguration: {
                status: "partial-configured",
                target: ["/home/demo/.zshrc", "/home/demo/.bashrc"],
                failedTargets: ["/home/demo/.config/fish/conf.d/oo.fish"],
            },
            stdout: stdout.writer,
            translator,
        });

        expect(stdout.read()).toBe(
            [
                "Updated PATH in:",
                "  /home/demo/.zshrc",
                "  /home/demo/.bashrc",
                "Could not update:",
                "  /home/demo/.config/fish/conf.d/oo.fish",
                "Restart your shell to reload PATH and use oo.",
                "",
            ].join("\n"),
        );
    });

    test("prints the manual setup note on failure", () => {
        const stdout = createTextBuffer();

        writeSelfUpdatePathNoteIfNeeded({
            executableDirectory,
            pathConfiguration: { status: "failed" },
            stdout: stdout.writer,
            translator,
        });

        expect(stdout.read()).toBe(
            "Add /home/demo/.local/bin to PATH to run oo in new shells.\n",
        );
    });

    test("prints the manual setup note when modification was skipped via flag/env", () => {
        const stdout = createTextBuffer();

        writeSelfUpdatePathNoteIfNeeded({
            executableDirectory,
            pathConfiguration: { status: "skipped" },
            stdout: stdout.writer,
            translator,
        });

        expect(stdout.read()).toContain("Add /home/demo/.local/bin to PATH");
    });
});
