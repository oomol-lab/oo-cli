import { stringify as stringifyToml } from "smol-toml";
import { z } from "zod";

import {
    supportedLocaleValues,
    supportedShellValues,
} from "../contracts/cli.ts";

export const localeSchema = z.enum(supportedLocaleValues);
export const shellSchema = z.enum(supportedShellValues);

export const settingsFileSchema = z.object({
    lang: localeSchema.optional(),
}).strict();

export type AppSettings = z.output<typeof settingsFileSchema>;

export const defaultSettings: AppSettings = {};

const defaultSettingsCommentBlock = [
    "# lang controls the CLI display language for help text, messages, and errors.",
    "# Supported values: \"en\" (English), \"zh\" (Simplified Chinese).",
    "# Default: auto-detect from LC_ALL, LC_MESSAGES, LANG, then system locale.",
    "# lang = \"en\"",
].join("\n");

export function renderSettingsFile(settings: AppSettings): string {
    const parsedSettings = settingsFileSchema.parse(settings);
    const lines = defaultSettingsCommentBlock.split("\n");

    if (parsedSettings.lang !== undefined) {
        lines.push(stringifyToml({ lang: parsedSettings.lang }).trimEnd());
    }

    return `${lines.join("\n")}\n`;
}
