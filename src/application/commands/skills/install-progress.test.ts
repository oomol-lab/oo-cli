import { stripVTControlCharacters } from "node:util";

import { describe, expect, test } from "bun:test";

import { createTextBuffer } from "../../../../__tests__/helpers.ts";
import { SkillsInstallProgressReporter } from "./install-progress.ts";

describe("skills install progress reporter", () => {
    test("reveals the removing step only after the installing step completes", () => {
        const stdout = createTextBuffer({
            hasColors: true,
            isTTY: true,
        });
        const reporter = new SkillsInstallProgressReporter(
            stdout.writer,
            {
                t: (key) => {
                    switch (key) {
                        case "skills.install.progress.installing.start":
                            return "Installing selected skills...";
                        case "skills.install.progress.installing.complete":
                            return "Installed";
                        case "skills.install.progress.installing.failed":
                            return "Installing selected skills failed";
                        case "skills.install.progress.removing.start":
                            return "Removing deselected skills...";
                        case "skills.install.progress.removing.complete":
                            return "Removed";
                        case "skills.install.progress.removing.failed":
                            return "Removing deselected skills failed";
                        default:
                            return key;
                    }
                },
            },
        );

        reporter.startInstalling(["audit", "frontend-design"]);

        const renderedInstallingOutput = stdout.read();
        const installingOutput = stripVTControlCharacters(stdout.read());

        expect(installingOutput).toContain("Installing selected skills...");
        expect(installingOutput).toContain("  audit");
        expect(installingOutput).toContain("  frontend-design");
        expect(installingOutput).not.toContain("Removing deselected skills...");
        expect(renderedInstallingOutput).toContain("\u001B[2maudit\u001B[22m");
        expect(renderedInstallingOutput).toContain("\u001B[2mfrontend-design\u001B[22m");

        reporter.completeInstalling(["audit", "frontend-design"]);
        reporter.startRemoving(["clarify"]);

        const removingOutput = stripVTControlCharacters(stdout.read());

        expect(removingOutput).toContain("◆ Installed");
        expect(removingOutput).toContain("  audit");
        expect(removingOutput).toContain("  frontend-design");
        expect(removingOutput).toContain("Removing deselected skills...");
        expect(removingOutput).toContain("  clarify");

        reporter.completeRemoving(["clarify"]);
        reporter.stop();

        const finalOutput = stripVTControlCharacters(stdout.read()).replaceAll(
            "\r",
            "",
        );

        expect(finalOutput).toContain("  frontend-design\n\n◆ Removed");
        expect(finalOutput).toContain("◆ Removed");
        expect(finalOutput).toContain("  clarify");
    });
});
