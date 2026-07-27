import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

import { z } from "zod";
import { createWriterColors } from "../../terminal-colors.ts";

export const emptyAuthCommandInputSchema = z.object({});

interface AuthBlockDetail {
    label: string;
    value: string;
}

type AuthBlockTone = "danger" | "success" | "warning";

export function formatAuthStrong(
    context: CliExecutionContext,
    value: string,
): string {
    return createWriterColors(context.stdout).bold(value);
}

export function writeAuthBlock(
    context: CliExecutionContext,
    options: {
        summary: string;
        tone: AuthBlockTone;
        details?: readonly AuthBlockDetail[];
    },
): void {
    const colors = createWriterColors(context.stdout);
    const details = options.details ?? [];
    const icon = readAuthIcon(options.tone, colors);

    context.stdout.write(`${icon} ${options.summary}\n`);

    for (const detail of details) {
        context.stdout.write(`  ${colors.dim("-")} ${detail.label}: ${colors.bold(detail.value)}\n`);
    }
}

function readAuthIcon(tone: AuthBlockTone, colors: TerminalColors): string {
    switch (tone) {
        case "danger":
            return colors.red("X");
        case "success":
            return colors.green("✓");
        case "warning":
            return colors.yellow("!");
    }
}
