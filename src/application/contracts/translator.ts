import type { CliMessageParams, SupportedLocale } from "./cli.ts";

export interface Translator {
    readonly locale: SupportedLocale;
    t: (key: string, params?: CliMessageParams) => string;
    resolveLocale: (candidate?: string | null) => SupportedLocale;
}
