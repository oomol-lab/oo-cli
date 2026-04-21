import type { CliExecutionContext, Writer } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

import { createWriterColors } from "../../terminal-colors.ts";
import { TerminalProgressRenderer } from "../shared/terminal-progress-renderer.ts";

export class SkillsInstallProgressReporter extends TerminalProgressRenderer {
    private activeLines: string[] = [];
    private completedLines: string[] = [];
    private readonly colors: TerminalColors;

    constructor(
        writer: Pick<Writer, "hasColors" | "write">,
        private readonly translator: Pick<CliExecutionContext["translator"], "t">,
    ) {
        super(writer);
        this.colors = createWriterColors(writer);
    }

    startInstalling(skillNames: readonly string[]): void {
        this.startStep(
            this.translator.t("skills.install.progress.installing.start"),
            skillNames,
        );
    }

    completeInstalling(skillNames: readonly string[]): void {
        this.completeStep(
            this.translator.t("skills.install.progress.installing.complete"),
            skillNames,
        );
    }

    failInstalling(): void {
        this.failStep(this.translator.t("skills.install.progress.installing.failed"));
    }

    startRemoving(skillNames: readonly string[]): void {
        this.startStep(
            this.translator.t("skills.install.progress.removing.start"),
            skillNames,
        );
    }

    completeRemoving(skillNames: readonly string[]): void {
        this.completeStep(
            this.translator.t("skills.install.progress.removing.complete"),
            skillNames,
        );
    }

    failRemoving(): void {
        this.failStep(this.translator.t("skills.install.progress.removing.failed"));
    }

    protected renderLines(): string[] {
        if (this.activeLines.length === 0) {
            return this.completedLines;
        }

        return [
            ...this.completedLines,
            ...this.activeLines,
        ];
    }

    private completeStep(
        message: string,
        skillNames: readonly string[],
    ): void {
        this.finishActiveStep([
            `${this.colors.green("◆")} ${message}`,
            ...this.formatItemLines(skillNames),
        ]);
    }

    private failStep(message: string): void {
        this.finishActiveStep([`${this.colors.red("◆")} ${message}`]);
    }

    private finishActiveStep(lines: readonly string[]): void {
        if (this.activeLines.length > 0) {
            if (this.completedLines.length > 0) {
                this.completedLines.push("");
            }
            this.completedLines.push(...lines);
            this.activeLines = [];
        }

        this.stopSpinner();
        this.render();
    }

    private startStep(
        message: string,
        skillNames: readonly string[],
    ): void {
        const itemLines = this.formatItemLines(skillNames);

        this.startSpinner(() => {
            this.activeLines = [
                `${this.colors.cyan(this.currentFrame)} ${message}`,
                ...itemLines,
            ];
        });
    }

    private formatItemLines(skillNames: readonly string[]): string[] {
        return skillNames.map(name => `  ${this.colors.dim(name)}`);
    }
}
