import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

import { z } from "zod";
import { getCurrentAuthAccount } from "../../schemas/auth.ts";
import { createWriterColors } from "../../terminal-colors.ts";

export const emptyAuthCommandInputSchema = z.object({});

export interface AuthBlockDetail {
    label: string;
    value: string;
    emphasize?: boolean;
}

export type AuthBlockTone = "danger" | "success" | "warning";

export async function readCurrentAuth(
    context: CliExecutionContext,
): Promise<{
    authFile: Awaited<ReturnType<CliExecutionContext["authStore"]["read"]>>;
    currentAccount: ReturnType<typeof getCurrentAuthAccount>;
}> {
    const authFile = await context.authStore.read();

    return {
        authFile,
        currentAccount: getCurrentAuthAccount(authFile),
    };
}

export function writeAuthLine(
    context: CliExecutionContext,
    message: string,
): void {
    context.stdout.write(`${message}\n`);
}

export function formatAuthStrong(
    context: CliExecutionContext,
    value: string,
): string {
    return createAuthColors(context).bold(value);
}

export function writeAuthBlock(
    context: CliExecutionContext,
    options: {
        summary: string;
        tone: AuthBlockTone;
        details?: readonly AuthBlockDetail[];
    },
): void {
    const colors = createAuthColors(context);
    const details = options.details ?? [];
    const icon = readAuthIcon(options.tone, colors);

    context.stdout.write(`${icon} ${options.summary}\n`);

    for (const detail of details) {
        const value = detail.emphasize === false
            ? detail.value
            : colors.bold(detail.value);

        context.stdout.write(`  ${colors.dim("-")} ${detail.label}: ${value}\n`);
    }
}

function createAuthColors(context: CliExecutionContext): TerminalColors {
    return createWriterColors(context.stdout);
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
