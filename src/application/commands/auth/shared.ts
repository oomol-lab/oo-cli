import type { CliExecutionContext } from "../../contracts/cli.ts";

import { Ansis } from "ansis";
import { z } from "zod";
import { getCurrentAuthAccount } from "../../schemas/auth.ts";

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

function createAuthColors(context: CliExecutionContext): Ansis {
    return new Ansis(context.stdout.hasColors?.() ? 3 : 0);
}

function readAuthIcon(tone: AuthBlockTone, colors: Ansis): string {
    switch (tone) {
        case "danger":
            return colors.red("X");
        case "success":
            return colors.green("✓");
        case "warning":
            return colors.yellow("!");
    }
}
