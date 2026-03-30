import type { CliExecutionContext } from "../../contracts/cli.ts";
import type { TerminalColors } from "../../terminal-colors.ts";

import { z } from "zod";
import { getCurrentAuthAccount } from "../../schemas/auth.ts";
import { createWriterColors } from "../../terminal-colors.ts";

export const emptyAuthCommandInputSchema = z.object({});

interface AuthBlockDetail {
    label: string;
    value: string;
    emphasize?: boolean;
}

type AuthBlockTone = "danger" | "success" | "warning";

export async function readCurrentAuth(
    context: CliExecutionContext,
): Promise<{
    authFile: Awaited<ReturnType<CliExecutionContext["authStore"]["read"]>>;
    currentAccount: ReturnType<typeof getCurrentAuthAccount>;
}> {
    const authFile = await context.authStore.read();
    const currentAccount = getCurrentAuthAccount(authFile);

    context.logger.debug(
        {
            accountCount: authFile.auth.length,
            currentAuthId: authFile.id,
            hasCurrentAccount: currentAccount !== undefined,
        },
        currentAccount === undefined
            ? "Current auth account is not available."
            : "Current auth account resolved.",
    );

    return {
        authFile,
        currentAccount,
    };
}

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
        const value = detail.emphasize === false
            ? detail.value
            : colors.bold(detail.value);

        context.stdout.write(`  ${colors.dim("-")} ${detail.label}: ${value}\n`);
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
