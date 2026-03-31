import type { SupportedLocale } from "../application/contracts/cli.ts";

interface ResolvePreferredLocaleInput {
    cliFlag?: SupportedLocale;
    storedLocale?: SupportedLocale;
    env: Record<string, string | undefined>;
    systemLocale?: string;
}

const requestLanguageByLocale = {
    en: "en",
    zh: "zh-CN",
} as const satisfies Record<SupportedLocale, string>;

export type RequestLanguage = (typeof requestLanguageByLocale)[SupportedLocale];

export function normalizeLocale(candidate?: string | null): SupportedLocale {
    const value = candidate?.trim().toLowerCase();

    if (!value) {
        return "en";
    }

    if (value.startsWith("zh")) {
        return "zh";
    }

    return "en";
}

export function parseExplicitLocale(
    candidate?: string | null,
): SupportedLocale | undefined {
    const value = candidate?.trim().toLowerCase();

    if (value === "en" || value === "zh") {
        return value;
    }

    return undefined;
}

export function detectCliLanguageFlag(argv: readonly string[]): string | undefined {
    let value: string | undefined;

    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];

        if (token === "--lang") {
            const nextToken = argv[index + 1];

            if (nextToken !== undefined && !nextToken.startsWith("-")) {
                value = nextToken;
            }
        }
        else if (token?.startsWith("--lang=")) {
            value = token.slice("--lang=".length);
        }
    }

    return value;
}

export function detectSystemLocale(
    env: Record<string, string | undefined>,
    systemLocale?: string,
): SupportedLocale {
    return normalizeLocale(
        env.LC_ALL ?? env.LC_MESSAGES ?? env.LANG ?? systemLocale,
    );
}

export function resolvePreferredLocale(
    input: ResolvePreferredLocaleInput,
): SupportedLocale {
    return (
        input.cliFlag
        ?? input.storedLocale
        ?? detectSystemLocale(input.env, input.systemLocale)
    );
}

export function resolveRequestLanguage(locale: SupportedLocale): RequestLanguage {
    return requestLanguageByLocale[locale];
}
