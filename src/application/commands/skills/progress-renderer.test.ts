import { describe, expect, test } from "bun:test";

import {
    createTextBuffer,
    waitForOutputText,
} from "../../../../__tests__/helpers.ts";
import { TerminalProgressRenderer } from "../shared/terminal-progress-renderer.ts";

describe("terminal progress renderer", () => {
    test("uses shared terminal control sequences to redraw output and restore the cursor", () => {
        const stdout = createTextBuffer({
            isTTY: true,
        });
        const renderer = new TestTerminalProgressRenderer(stdout.writer);

        renderer.setLines(["first", "second"]);
        renderer.setLines(["next", "value"]);
        renderer.stop();

        expect(stdout.read()).toBe(
            "\u001B[?25lfirst\nsecond\n"
            + "\u001B[2A\r\u001B[2Knext\n\r\u001B[2Kvalue\n"
            + "\u001B[?25h",
        );
    });

    test("updates spinner output when the interval ticks", async () => {
        const stdout = createTextBuffer({
            isTTY: true,
        });
        const renderer = new SpinnerTerminalProgressRenderer(stdout.writer);

        try {
            renderer.start("Loading selected skills...");
            renderer.rerender();

            const initialOutput = stdout.read();

            expect(initialOutput).toContain("| Loading selected skills...");
            expect(stdout.read()).toBe(initialOutput);

            await waitForOutputText(stdout, "/ Loading selected skills...");
        }
        finally {
            renderer.stop();
        }
    });
});

class TestTerminalProgressRenderer extends TerminalProgressRenderer {
    private lines: string[] = [];

    setLines(lines: readonly string[]): void {
        this.lines = [...lines];
        this.render();
    }

    protected renderLines(): string[] {
        return this.lines;
    }
}

class SpinnerTerminalProgressRenderer extends TerminalProgressRenderer {
    private lines: string[] = [];

    start(message: string): void {
        this.startSpinner(() => {
            this.lines = [`${this.currentFrame} ${message}`];
        });
    }

    rerender(): void {
        this.render();
    }

    protected renderLines(): string[] {
        return this.lines;
    }
}
