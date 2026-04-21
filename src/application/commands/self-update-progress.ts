import type { CliExecutionContext, Writer } from "../contracts/cli.ts";
import type {
    SelfUpdateProgressEvent,
    SelfUpdateProgressStage,
    SelfUpdateProgressStageDetails,
} from "../self-update/progress.ts";

import { createWriterColors } from "../terminal-colors.ts";
import { TerminalProgressRenderer } from "./shared/terminal-progress-renderer.ts";

export type SelfUpdateProgressMode = "install" | "update";

interface ActiveSelfUpdateStage extends SelfUpdateProgressStageDetails {
    stage: SelfUpdateProgressStage;
}

export class SelfUpdateProgressReporter extends TerminalProgressRenderer {
    private activeStage: ActiveSelfUpdateStage | undefined;
    private readonly colors;
    private readonly completedLines: string[] = [];

    constructor(
        writer: Pick<Writer, "hasColors" | "write">,
        private readonly mode: SelfUpdateProgressMode,
        private readonly translator: Pick<CliExecutionContext["translator"], "t">,
    ) {
        super(writer);
        this.colors = createWriterColors(writer);
    }

    createReportStage(): (event: SelfUpdateProgressEvent) => void {
        return event => this.setStage(event.stage, {
            version: event.version,
        });
    }

    abort(): void {
        this.activeStage = undefined;
        super.stop();
    }

    finish(): void {
        this.completeActiveStage();
        super.stop();
    }

    setStage(
        stage: SelfUpdateProgressStage,
        details: SelfUpdateProgressStageDetails = {},
    ): void {
        if (this.activeStage?.stage === stage) {
            this.activeStage = {
                ...this.activeStage,
                ...details,
            };
            this.render();
            return;
        }

        this.completeActiveStage();
        this.activeStage = {
            stage,
            ...details,
        };
        this.startSpinner();
    }

    protected renderLines(): string[] {
        const lines = [
            this.colors.bold(
                this.translator.t(`selfUpdate.progress.${this.mode}.header`),
            ),
            ...this.completedLines,
        ];

        if (this.activeStage !== undefined) {
            lines.push(
                `${this.colors.cyan(this.currentFrame)} ${this.readStageMessage(
                    this.activeStage,
                    "start",
                )}`,
            );
        }

        return lines;
    }

    private completeActiveStage(): void {
        if (this.activeStage === undefined) {
            return;
        }

        this.completedLines.push(
            `${this.colors.green("◆")} ${this.readStageMessage(
                this.activeStage,
                "complete",
            )}`,
        );
        this.activeStage = undefined;
    }

    private readStageMessage(
        stage: ActiveSelfUpdateStage,
        state: "complete" | "start",
    ): string {
        return this.translator.t(
            `selfUpdate.progress.${stage.stage}.${state}`,
            stage.version === undefined ? undefined : { version: stage.version },
        );
    }
}
