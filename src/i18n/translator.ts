import type {
    CliMessageParams,
    SupportedLocale,
} from "../application/contracts/cli.ts";
import type { Translator } from "../application/contracts/translator.ts";
import type { MessageKey } from "./catalog.ts";
import { messageCatalog } from "./catalog.ts";
import { normalizeLocale } from "./locale.ts";

function interpolate(
    template: string,
    params?: CliMessageParams,
): string {
    if (!params) {
        return template;
    }

    let output = template;

    for (const [key, value] of Object.entries(params)) {
        output = output.split(`{${key}}`).join(String(value));
    }

    return output;
}

export function createTranslator(locale: SupportedLocale): Translator {
    return {
        locale,
        resolveLocale: normalizeLocale,
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
