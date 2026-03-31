import type { Writer } from "../../contracts/cli.ts";

import {
    moveCursorUp,
    rewriteTerminalLines,
    terminalControl,
} from "../../terminal-control.ts";

const spinnerFrames = ["|", "/", "-", "\\"] as const;

export abstract class TerminalProgressRenderer {
    private frameIndex = 0;
    private intervalId: ReturnType<typeof setInterval> | undefined;
    private renderedLineCount = 0;
    private renderedOutput = "";

    constructor(
        protected readonly writer: Pick<Writer, "hasColors" | "write">,
    ) {}

    stop(): void {
        this.stopSpinner();

        if (this.renderedLineCount === 0) {
            return;
        }

        this.render();
        this.writer.write(terminalControl.showCursor);
    }

    protected get currentFrame(): string {
        return spinnerFrames[this.frameIndex]!;
    }

    protected startSpinner(onTick?: () => void): void {
        this.stopSpinner();
        this.frameIndex = 0;
        onTick?.();
        this.render();
        this.intervalId = setInterval(() => {
            this.frameIndex = (this.frameIndex + 1) % spinnerFrames.length;
            onTick?.();
            this.render();
        }, 80);
        this.intervalId.unref?.();
    }

    protected stopSpinner(): void {
        if (this.intervalId !== undefined) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }

    protected render(): void {
        const nextOutput = this.renderLines().join("\n");

        if (nextOutput === this.renderedOutput) {
            return;
        }

        if (this.renderedLineCount === 0) {
            this.writer.write(terminalControl.hideCursor);
            this.writer.write(`${nextOutput}\n`);
            this.renderedLineCount = nextOutput.split("\n").length;
            this.renderedOutput = nextOutput;
            return;
        }

        const renderedLines = nextOutput.split("\n");
        const rewrittenContent = rewriteTerminalLines(renderedLines);

        this.writer.write(
            `${moveCursorUp(this.renderedLineCount)}${rewrittenContent}\n`,
        );
        this.renderedLineCount = renderedLines.length;
        this.renderedOutput = nextOutput;
    }

    protected abstract renderLines(): string[];
}
