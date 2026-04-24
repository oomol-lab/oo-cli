import type { Writer } from "../contracts/cli.ts";
import type { SelfUpdatePathConfigurationResult } from "../contracts/self-update.ts";
import type { Translator } from "../contracts/translator.ts";
import { writeLine } from "./shared/output.ts";

export function writeSelfUpdatePathNoteIfNeeded(options: {
    executableDirectory: string;
    pathConfiguration: SelfUpdatePathConfigurationResult;
    stdout: Writer;
    translator: Pick<Translator, "t">;
}): void {
    if (options.pathConfiguration.status === "already-configured") {
        // `target` is populated only when a profile file already carries our
        // marker — the current shell's env.PATH just hasn't been reloaded yet,
        // so advise a restart. Without `target`, env.PATH itself already has
        // the directory and there is nothing to tell the user.
        if ((options.pathConfiguration.target?.length ?? 0) > 0) {
            writeLine(
                options.stdout,
                options.translator.t("selfUpdate.pathConfiguredNote", {
                    path: options.executableDirectory,
                }),
            );
        }
        return;
    }

    if (options.pathConfiguration.status === "configured") {
        writeLine(
            options.stdout,
            options.translator.t("selfUpdate.pathConfiguredNote", {
                path: options.executableDirectory,
            }),
        );
        return;
    }

    if (options.pathConfiguration.status === "partial-configured") {
        // Some profiles were updated, others failed. List both explicitly so
        // the user can tell at a glance what worked and what didn't — no
        // "success + failure" dissonance in a single sentence.
        writeLine(
            options.stdout,
            options.translator.t("selfUpdate.pathPartiallyConfigured.updatedHeader"),
        );
        for (const target of options.pathConfiguration.target ?? []) {
            writeLine(options.stdout, `  ${target}`);
        }
        writeLine(
            options.stdout,
            options.translator.t("selfUpdate.pathPartiallyConfigured.failedHeader"),
        );
        for (const target of options.pathConfiguration.failedTargets ?? []) {
            writeLine(options.stdout, `  ${target}`);
        }
        writeLine(
            options.stdout,
            options.translator.t("selfUpdate.pathPartiallyConfigured.restart"),
        );
        return;
    }

    // "failed" and "skipped" both fall back to the manual setup note.
    writeLine(
        options.stdout,
        options.translator.t("selfUpdate.install.pathNote", {
            path: options.executableDirectory,
        }),
    );
}
