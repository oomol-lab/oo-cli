import type { Argument, Command, Option } from "commander";
import type { Translator } from "../../application/contracts/translator.ts";

import { Help } from "commander";
import { APP_NAME } from "../../application/config/app-config.ts";
import { createTerminalColors } from "../../application/terminal-colors.ts";

const OOMOL_BRAND_NAME = "OOMOL";

export class LocalizedHelp extends Help {
    private colors = createTerminalColors(false);

    constructor(private readonly translator: Translator) {
        super();
        this.showGlobalOptions = true;
    }

    override prepareContext(contextOptions: {
        error?: boolean;
        helpWidth?: number;
        outputHasColors?: boolean;
    }): void {
        super.prepareContext(contextOptions);
        this.colors = createTerminalColors(Boolean(contextOptions.outputHasColors));
    }

    override styleTitle(title: string): string {
        switch (title) {
            case "Usage:":
                return this.translator.t("help.usage");
            case "Arguments:":
                return this.translator.t("help.arguments");
            case "Options:":
                return this.translator.t("help.options");
            case "Global Options:":
                return this.translator.t("help.globalOptions");
            case "Commands:":
                return this.translator.t("help.commands");
            default:
                return title;
        }
    }

    override optionDescription(option: Option): string {
        return formatHelpDescription(option.description, [
            option.argChoices?.length
                ? `${this.translator.t("help.extra.choices")}: ${formatChoices(option.argChoices)}`
                : undefined,
            option.defaultValue !== undefined
                ? `${this.translator.t("help.extra.default")}: ${String(option.defaultValueDescription ?? JSON.stringify(option.defaultValue))}`
                : undefined,
            option.presetArg !== undefined && option.optional
                ? `${this.translator.t("help.extra.preset")}: ${String(JSON.stringify(option.presetArg))}`
                : undefined,
            option.envVar !== undefined
                ? `${this.translator.t("help.extra.env")}: ${option.envVar}`
                : undefined,
        ]);
    }

    override argumentDescription(argument: Argument): string {
        return formatHelpDescription(argument.description, [
            argument.argChoices?.length
                ? `${this.translator.t("help.extra.choices")}: ${formatChoices(argument.argChoices)}`
                : undefined,
            argument.defaultValue !== undefined
                ? `${this.translator.t("help.extra.default")}: ${String(argument.defaultValueDescription ?? JSON.stringify(argument.defaultValue))}`
                : undefined,
        ]);
    }

    override styleCommandDescription(description: string): string {
        const appDescription = this.translator.t("app.description");

        if (description !== appDescription) {
            return description;
        }

        return this.translator.t("help.appDescription.colored", {
            appName: this.colors.magenta(APP_NAME),
            companyName: this.colors.cyan(OOMOL_BRAND_NAME),
        });
    }

    override formatHelp(cmd: Command, helper: Help): string {
        const formattedHelp = super.formatHelp(cmd, helper);
        const sections = formattedHelp.split("\n\n");
        const usagePrefix = `${this.translator.t("help.usage")} `;

        if (!sections[0]?.startsWith(usagePrefix)) {
            return formattedHelp;
        }

        return sections.slice(1).join("\n\n");
    }
}

function formatChoices(choices: readonly string[]): string {
    return choices.map(choice => JSON.stringify(choice)).join(", ");
}

function formatHelpDescription(
    description: string | undefined,
    extraInfo: Array<string | undefined>,
): string {
    const resolvedExtraInfo = extraInfo.filter(
        (item): item is string => item !== undefined,
    );

    if (resolvedExtraInfo.length === 0) {
        return description ?? "";
    }

    const extraDescription = `(${resolvedExtraInfo.join(", ")})`;

    if (description) {
        return `${description} ${extraDescription}`;
    }

    return extraDescription;
}
