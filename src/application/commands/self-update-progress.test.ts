import type { CliMessageParams } from "../contracts/cli.ts";

import { stripVTControlCharacters } from "node:util";

import { describe, expect, test } from "bun:test";

import { createTextBuffer } from "../../../__tests__/helpers.ts";
import { SelfUpdateProgressReporter } from "./self-update-progress.ts";

describe("self-update progress reporter", () => {
    test("completes the active stage when a new stage begins", () => {
        const stderr = createTextBuffer({
            hasColors: true,
            isTTY: true,
        });
        const reporter = new SelfUpdateProgressReporter(
            stderr.writer,
            "install",
            createTranslatorStub(),
        );

        reporter.setStage("resolve");

        const resolvingOutput = stderr.read();
        const strippedResolvingOutput = normalizeOutput(resolvingOutput);

        expect(strippedResolvingOutput).toContain("Installing oo");
        expect(strippedResolvingOutput).toContain("Resolving latest release...");
        expect(resolvingOutput).toContain("\u001B[36m|\u001B[39m");

        reporter.setStage("resolve", {
            version: "1.2.3",
        });
        reporter.setStage("prepare");
        reporter.setStage("download", {
            version: "1.2.3",
        });
        reporter.finish();

        const finalOutput = normalizeOutput(stderr.read());

        expect(finalOutput).toContain("◆ Resolved latest release 1.2.3.");
        expect(finalOutput).toContain("◆ Prepared managed install.");
        expect(finalOutput).toContain("◆ Downloaded oo 1.2.3.");
    });
});

function normalizeOutput(text: string): string {
    return stripVTControlCharacters(text).replaceAll("\r", "");
}

function createTranslatorStub() {
    return {
        t: (key: string, params?: CliMessageParams) => {
            switch (key) {
                case "selfUpdate.progress.install.header":
                    return "Installing oo";
                case "selfUpdate.progress.resolve.start":
                    return "Resolving latest release...";
                case "selfUpdate.progress.resolve.complete":
                    return `Resolved latest release ${params?.version}.`;
                case "selfUpdate.progress.prepare.start":
                    return "Preparing managed install...";
                case "selfUpdate.progress.prepare.complete":
                    return "Prepared managed install.";
                case "selfUpdate.progress.download.start":
                    return `Downloading oo ${params?.version}...`;
                case "selfUpdate.progress.download.complete":
                    return `Downloaded oo ${params?.version}.`;
                default:
                    return key;
            }
        },
    };
}
