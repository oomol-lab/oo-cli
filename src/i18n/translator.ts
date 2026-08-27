import type {
    CliMessageParams,
    SupportedLocale,
} from "../application/contracts/cli.ts";
import type { Translator } from "../application/contracts/translator.ts";
import type { MessageKey } from "./catalog.ts";
import { messageCatalog } from "./catalog.ts";

function interpolate(
    template: string,
    params?: CliMessageParams,
): string {
    if (!params) {
        return template;
    }

    let output = template;

    for (const [key, value] of Object.entries(params)) {
        output = output.replaceAll(`{${key}}`, String(value));
    }

    return output;
}

export function createTranslator(locale: SupportedLocale): Translator {
    return {
        locale,
        t(key, params) {
            const catalogKey = key as MessageKey;
            const message
                = messageCatalog[locale][catalogKey]
                    ?? messageCatalog.en[catalogKey]
                    ?? key;

            return interpolate(message, params);
        },
    };
}
