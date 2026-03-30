import type { CliExecutionContext, Writer } from "../../contracts/cli.ts";

import { createWriterColors } from "../../terminal-colors.ts";

export type SkillUpdateProgressState
    = | "checking"
        | "preparing"
        | "publishing"
        | "current"
        | "updated"
        | "failed";

interface SkillUpdateProgressItem {
    detail?: string;
    state: SkillUpdateProgressState;
}

const spinnerFrames = ["|", "/", "-", "\\"] as const;

export class SkillsUpdateProgressReporter {
    private frameIndex = 0;
    private intervalId: ReturnType<typeof setInterval> | undefined;
    private readonly itemOrder: string[];
    private readonly items = new Map<string, SkillUpdateProgressItem>();
    private renderedLineCount = 0;
    private renderedOutput = "";
    private started = false;

    constructor(
        private readonly writer: Pick<Writer, "hasColors" | "write">,
        skillNames: readonly string[],
        private readonly translator: Pick<CliExecutionContext["translator"], "t">,
    ) {
        this.itemOrder = [...skillNames];

        for (const skillName of skillNames) {
            this.items.set(skillName, {
                detail: undefined,
                state: "checking",
            });
        }
    }

    start(): void {
        if (this.started) {
            return;
        }

        this.started = true;
        this.render();
        this.intervalId = setInterval(() => {
            this.frameIndex = (this.frameIndex + 1) % spinnerFrames.length;
            this.render();
        }, 80);
        this.intervalId.unref?.();
    }

    stop(): void {
        if (this.intervalId !== undefined) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }

        if (!this.started) {
            return;
        }

        this.render();
        this.writer.write("\u001B[?25h");
    }

    updateSkill(
        skillName: string,
        state: SkillUpdateProgressState,
        detail?: string,
    ): void {
        this.items.set(skillName, {
            detail,
            state,
        });
        this.render();
    }

    private render(): void {
        const nextOutput = this.renderLines().join("\n");

        if (nextOutput === this.renderedOutput) {
            return;
        }

        if (this.renderedLineCount === 0) {
            this.writer.write("\u001B[?25l");
            this.writer.write(`${nextOutput}\n`);
            this.renderedLineCount = countRenderedLines(nextOutput);
            this.renderedOutput = nextOutput;
            return;
        }

        const renderedLines = nextOutput.split("\n");
        const rewrittenContent = renderedLines.map(
            line => `\r\u001B[2K${line}`,
        ).join("\n");

        this.writer.write(
            `\u001B[${this.renderedLineCount}A${rewrittenContent}\n`,
        );
        this.renderedLineCount = renderedLines.length;
        this.renderedOutput = nextOutput;
    }

    private renderLines(): string[] {
        const colors = createWriterColors(this.writer);

        return [
            colors.bold(this.translator.t("skills.update.progress.header")),
            ...this.itemOrder.map((skillName) => {
                const item = this.items.get(skillName) ?? {
                    detail: undefined,
                    state: "checking" as const,
                };

                return formatProgressItemLine(
                    skillName,
                    item,
                    spinnerFrames[this.frameIndex]!,
                    colors,
                    this.translator,
                );
            }),
        ];
    }
}

function formatProgressItemLine(
    skillName: string,
    item: SkillUpdateProgressItem,
    frame: string,
    colors: ReturnType<typeof createWriterColors>,
    translator: Pick<CliExecutionContext["translator"], "t">,
): string {
    switch (item.state) {
        case "checking":
        case "preparing":
        case "publishing":
            return `${colors.cyan(frame)} ${colors.bold(skillName)} ${readProgressStateLabel(item.state, translator)}`;
        case "current":
            return `${colors.yellow("=")} ${colors.bold(skillName)} ${item.detail ?? readProgressStateLabel(item.state, translator)}`;
        case "updated":
            return `${colors.green("✓")} ${colors.bold(skillName)} ${item.detail ?? readProgressStateLabel(item.state, translator)}`;
        case "failed":
            return `${colors.red("!")} ${colors.bold(skillName)} ${item.detail ?? readProgressStateLabel(item.state, translator)}`;
    }
}

function readProgressStateLabel(
    state: SkillUpdateProgressState,
    translator: Pick<CliExecutionContext["translator"], "t">,
): string {
    return translator.t(`skills.update.progress.${state}`);
}

function countRenderedLines(output: string): number {
    return output.split("\n").length;
}
