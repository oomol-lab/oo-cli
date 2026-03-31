import { describe, expect, test } from "bun:test";

import { createTextBuffer } from "../../../../__tests__/helpers.ts";
import { TerminalProgressRenderer } from "./progress-renderer.ts";

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
