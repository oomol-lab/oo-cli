import type { CliExecutionContext, Writer } from "../../contracts/cli.ts";

import { createWriterColors } from "../../terminal-colors.ts";
import { TerminalProgressRenderer } from "./progress-renderer.ts";

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

export class SkillsUpdateProgressReporter extends TerminalProgressRenderer {
    private readonly colors;
    private readonly itemOrder: string[];
    private readonly items = new Map<string, SkillUpdateProgressItem>();
    private spinnerStarted = false;

    constructor(
        writer: Pick<Writer, "hasColors" | "write">,
        skillNames: readonly string[],
        private readonly translator: Pick<CliExecutionContext["translator"], "t">,
    ) {
        super(writer);
        this.colors = createWriterColors(writer);
        this.itemOrder = [...skillNames];

        for (const skillName of skillNames) {
            this.items.set(skillName, {
                detail: undefined,
                state: "checking",
            });
        }
    }

    start(): void {
        if (this.spinnerStarted) {
            return;
        }

        this.spinnerStarted = true;
        this.startSpinner();
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

    protected renderLines(): string[] {
        return [
            this.colors.bold(this.translator.t("skills.update.progress.header")),
            ...this.itemOrder.map((skillName) => {
                const item = this.items.get(skillName) ?? {
                    detail: undefined,
                    state: "checking" as const,
                };

                return formatProgressItemLine(
                    skillName,
                    item,
                    this.currentFrame,
                    this.colors,
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
